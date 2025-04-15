import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import FormData from 'form-data';

interface ComfyUINode {
	inputs: Record<string, any>;
	class_type: string;
	_meta?: {
		title: string;
	};
}

interface ComfyUIWorkflow {
	[key: string]: ComfyUINode;
}

interface ImageInfo {
	name: string;
	subfolder: string;
	type: string;
}

export class ComfyuiImageToVideo implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ComfyUI Image to Video',
		name: 'comfyuiImageToVideo',
		icon: 'file:comfyui.svg',
		group: ['transform'],
		version: 1,
		description: 'Convert images to videos using ComfyUI workflow',
		defaults: {
			name: 'ComfyUI Image to Video',
		},
		credentials: [
			{
				name: 'comfyUIApi',
				required: true,
			},
		],
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Workflow JSON',
				name: 'workflow',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				required: true,
				description: 'The ComfyUI workflow in JSON format',
			},
			{
				displayName: 'Input Image',
				name: 'inputImage',
				type: 'string',
				default: '',
				required: true,
				description: 'URL, base64, or binary data of the input image',
			},
			{
				displayName: 'Input Type',
				name: 'inputType',
				type: 'options',
				options: [
					{ name: 'URL', value: 'url' },
					{ name: 'Base64', value: 'base64' },
					{ name: 'Binary', value: 'binary' }
				],
				default: 'url',
				required: true,
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				default: 30,
				description: 'Maximum time in minutes to wait for video generation',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const credentials = await this.getCredentials('comfyUIApi');
		const workflow = this.getNodeParameter('workflow', 0) as string;
		const inputImage = this.getNodeParameter('inputImage', 0) as string;
		const inputType = this.getNodeParameter('inputType', 0) as string;
		const timeout = this.getNodeParameter('timeout', 0) as number;

		const apiUrl = credentials.apiUrl as string;
		const apiKey = credentials.apiKey as string;

		console.log('[ComfyUI] Executing image to video conversion with API URL:', apiUrl);

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		if (apiKey) {
			console.log('[ComfyUI] Using API key authentication');
			headers['Authorization'] = `Bearer ${apiKey}`;
		}

		try {
			// Check API connection
			console.log('[ComfyUI] Checking API connection...');
			await this.helpers.request({
				method: 'GET',
				url: `${apiUrl}/system_stats`,
				headers,
				json: true,
			});

			// Prepare input image
			let imageBuffer: Buffer;
			if (inputType === 'url') {
				// Download image from URL
				const response = await this.helpers.request({
					method: 'GET',
					url: inputImage,
					encoding: null,
				});
				imageBuffer = Buffer.from(response);
			} else if (inputType === 'binary') {
				// Get binary data from n8n
				imageBuffer = this.getNodeParameter('inputImage', 0, '', { extractValue: true }) as Buffer;
			} else {
				// Base64 input
				imageBuffer = Buffer.from(inputImage, 'base64');
			}

			// Upload image to ComfyUI
			console.log('[ComfyUI] Uploading image...');
			const formData = new FormData();
			formData.append('image', imageBuffer, 'input.png');
			formData.append('subfolder', '');
			formData.append('overwrite', 'true');

			const uploadResponse = await this.helpers.request({
				method: 'POST',
				url: `${apiUrl}/upload/image`,
				headers: {
					...headers,
					...formData.getHeaders(),
				},
				body: formData,
			});

			const imageInfo = JSON.parse(uploadResponse) as ImageInfo;
			console.log('[ComfyUI] Image uploaded:', imageInfo);

			// Parse and modify workflow JSON
			let workflowData;
			try {
				workflowData = JSON.parse(workflow);
			} catch (error) {
				throw new NodeApiError(this.getNode(), { 
					message: 'Invalid workflow JSON. Please check the JSON syntax and try again.',
					description: error.message
				});
			}

			// Validate workflow structure
			if (typeof workflowData !== 'object' || workflowData === null) {
				throw new NodeApiError(this.getNode(), { 
					message: 'Invalid workflow structure. The workflow must be a valid JSON object.'
				});
			}

			// Find the LoadImage node and update its image data
			const loadImageNode = Object.values(workflowData as ComfyUIWorkflow).find((node: ComfyUINode) => 
				node.class_type === 'LoadImage' && node.inputs && node.inputs.image !== undefined
			);

			if (!loadImageNode) {
				throw new NodeApiError(this.getNode(), { 
					message: 'No LoadImage node found in the workflow. The workflow must contain a LoadImage node with an image input.'
				});
			}

			// Update the image input with the uploaded image info
			loadImageNode.inputs.image = imageInfo.name;

			// Queue video generation
			console.log('[ComfyUI] Queueing video generation...');
			const response = await this.helpers.request({
				method: 'POST',
				url: `${apiUrl}/prompt`,
				headers,
				body: {
					prompt: workflowData,
				},
				json: true,
			});

			if (!response.prompt_id) {
				throw new NodeApiError(this.getNode(), { message: 'Failed to get prompt ID from ComfyUI' });
			}

			const promptId = response.prompt_id;
			console.log('[ComfyUI] Video generation queued with ID:', promptId);

			// Poll for completion
			let attempts = 0;
			const maxAttempts = 60 * timeout; // Convert minutes to seconds
			await new Promise(resolve => setTimeout(resolve, 5000));
			while (attempts < maxAttempts) {
				console.log(`[ComfyUI] Checking video generation status (attempt ${attempts + 1}/${maxAttempts})...`);
				await new Promise(resolve => setTimeout(resolve, 1000));
				attempts++;

				const history = await this.helpers.request({
					method: 'GET',
					url: `${apiUrl}/history/${promptId}`,
					headers,
					json: true,
				});

				const promptResult = history[promptId];
				if (!promptResult) {
					console.log('[ComfyUI] Prompt not found in history');
					continue;
				}

				if (promptResult.status === undefined) {
					console.log('[ComfyUI] Execution status not found');
					continue;
				}

				if (promptResult.status?.completed) {
					console.log('[ComfyUI] Video generation completed');

					if (promptResult.status?.status_str === 'error') {
						throw new NodeApiError(this.getNode(), { message: '[ComfyUI] Video generation failed' });
					}

					// Check outputs structure
					console.log('[ComfyUI] Raw outputs structure:', JSON.stringify(promptResult.outputs, null, 2));
					
					// Get all images outputs with simpler approach
					const mediaOutputs = Object.values(promptResult.outputs)
						.flatMap((nodeOutput: any) => nodeOutput.images || nodeOutput.gifs || [])
						.filter((image: any) => image.type === 'output' || image.type === 'temp')
						.map((img: any) => ({
							...img,
							url: `${apiUrl}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type}`
						}));

					console.log('[ComfyUI] Found media outputs:', mediaOutputs);

					if (mediaOutputs.length === 0) {
						throw new NodeApiError(this.getNode(), { message: '[ComfyUI] No media outputs found in results' });
					}

					// Prioritize video outputs (WEBP, MP4, etc.)
					const videoOutputs = mediaOutputs.filter(output => 
						output.filename.endsWith('.webp') || 
						output.filename.endsWith('.mp4') ||
						output.filename.endsWith('.gif')
					);

					if (videoOutputs.length === 0) {
						throw new NodeApiError(this.getNode(), { message: '[ComfyUI] No video outputs found in results' });
					}

					console.log('[ComfyUI] Found video outputs:', videoOutputs);

					// Return the first video output
					const videoOutput = videoOutputs[0];
                    
                    const videoResponse = await this.helpers.request({
                        method: 'GET',
                        url: videoOutput.url,
                        encoding: null,
                        resolveWithFullResponse: true
                    });

                    if (videoResponse.statusCode === 404) {
                        throw new NodeApiError(this.getNode(), { message: `Video file not found at ${videoOutput.url}` });
                    }

                    console.log('[ComfyUI] Using media directly from ComfyUI');
                    const buffer = Buffer.from(videoResponse.body);
                    const base64Data = buffer.toString('base64');
                    const fileSize = Math.round(buffer.length / 1024 * 10) / 10 + " kB";

                    // Determine MIME type based on file extension
                    let mimeType = 'image/webp';
                    let fileExtension = 'webp';
                    
                    if (videoOutput.filename.endsWith('.mp4')) {
                        mimeType = 'video/mp4';
                        fileExtension = 'mp4';
                    } else if (videoOutput.filename.endsWith('.gif')) {
                        mimeType = 'image/gif';
                        fileExtension = 'gif';
                    }

                    return [[{
                        json: {
                            mimeType,
                            fileName: videoOutput.filename,
                            data: base64Data,
                            status: promptResult.status,
                        },
                        binary: {
                            data: {
                                fileName: videoOutput.filename,
                                data: base64Data,
                                fileType: 'video',
                                fileSize,
                                fileExtension,
                                mimeType
                            }
                        }
                    }]];
				}
			}
			throw new NodeApiError(this.getNode(), { message: `Video generation timeout after ${timeout} minutes` });
		} catch (error) {
			console.error('[ComfyUI] Video generation error:', error);
			throw new NodeApiError(this.getNode(), { 
				message: `ComfyUI API Error: ${error.message}`,
				description: error.description || ''
			});
		}
	}
} 