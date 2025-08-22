// comfyuiVideoToVideo.ts
import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import FormData from 'form-data';
import { N8nApiClient } from './apiClient';
import { UrlInputProvider, Base64InputProvider, BinaryInputProvider } from './inputProviders';
import { WorkflowService } from './workflowService';
import { Poller } from './poller';

export class ComfyuiVideoToVideo implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ComfyUI Video to Video',
		name: 'comfyuiVideoToVideo',
		icon: 'file:comfyui.svg',
		group: ['transform'],
		version: 1,
		description: 'Convert Video to videos using ComfyUI workflow',
		defaults: {
			name: 'ComfyUI Video to Video',
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
				displayName: 'Input Image',
				name: 'inputImage',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						inputType: ['url', 'base64'],
					},
				},
				description: 'URL or base64 data of the input image',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						inputType: ['binary'],
					},
				},
				description: 'Name of the binary property containing the image',
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
		const api = new N8nApiClient(this.helpers);
		const credentials = await this.getCredentials('comfyUIApi');
		const apiUrl = credentials.apiUrl as string;
		const apiKey = credentials.apiKey as string;
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

		try {
			// Choose input strategy
			const inputType = this.getNodeParameter('inputType', 0) as string;
			const workflow = this.getNodeParameter('workflow', 0) as string;
			const timeout = this.getNodeParameter('timeout', 0) as number;
			let provider;

			if (inputType === 'url') {
				const inputImage = this.getNodeParameter('inputImage', 0) as string;
				provider = new UrlInputProvider(api, inputImage);
			} else if (inputType === 'base64') {
				const inputImage = this.getNodeParameter('inputImage', 0) as string;
				provider = new Base64InputProvider(inputImage);
			} else {
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', 0) as string;
				provider = new BinaryInputProvider(this.helpers, binaryPropertyName, this.getInputData());
			}

			const buffer = await provider.getBuffer();

			// Upload
			const formData = new FormData();
			formData.append('image', buffer, 'input.png');
			formData.append('subfolder', '');
			formData.append('overwrite', 'true');

			const uploadResponse = await api.request<string>({
				method: 'POST',
				url: `${apiUrl}/upload/image`,
				headers: { ...headers, ...formData.getHeaders() },
				body: formData,
			});

			const imageInfo = JSON.parse(uploadResponse);

			// Workflow
			const wf = WorkflowService.parse(workflow);
			WorkflowService.injectImage(wf, imageInfo);

			// Queue job
			const response = await api.request<any>({
				method: 'POST',
				url: `${apiUrl}/prompt`,
				headers,
				body: { prompt: wf },
				json: true,
			});
			if (!response.prompt_id) throw new NodeApiError(this.getNode(), { message: 'Failed to get prompt ID'});

			// Polling
			const poller = new Poller(api, apiUrl, headers);
			const promptResult = await poller.waitForCompletion(response.prompt_id, timeout);

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
			const videoBuffer = Buffer.from(videoResponse.body);
			const base64Data = videoBuffer.toString('base64');
			const fileSize = Math.round(videoBuffer.length / 1024 * 10) / 10 + " kB";

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

		} catch (err: any) {
			throw new NodeApiError(this.getNode(), { message: err.message });
		}
	}
}
