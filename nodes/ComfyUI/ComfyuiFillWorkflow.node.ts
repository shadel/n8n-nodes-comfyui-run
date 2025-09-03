import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { N8nApiClient } from './apiClient';
import { Poller } from './poller';
import { WorkflowService } from './workflowService';

export class ComfyuiFillWorkflow implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ComfyUI Wf to Media',
		name: 'comfyuiFillWorkflow',
		icon: 'file:comfyui.svg',
		group: ['transform'],
		version: 1,
		description: 'Convert Wf to medias using ComfyUI workflow',
		defaults: {
			name: 'ComfyUI Fill Workflow',
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
			const workflow = this.getNodeParameter('workflow', 0) as string;
			const timeout = this.getNodeParameter('timeout', 0) as number;

			const wf = WorkflowService.parse(workflow);

			// Queue job
			const response = await api.request<any>({
				method: 'POST',
				url: `${apiUrl}/prompt`,
				headers,
				body: { prompt: wf },
				json: true,
			});
			if (!response.prompt_id) throw  new NodeApiError(this.getNode(), { message: 'Failed to get prompt ID'});

			// Polling
			const poller = new Poller(api, apiUrl, headers);
			const promptResult = await poller.waitForCompletion(response.prompt_id, timeout);

			console.log('[ComfyUI] Video generation completed');

			if (promptResult.status?.status_str === 'error') {
				throw new NodeApiError(this.getNode(), { message: '[ComfyUI] Video generation failed' });
			}

			// Check outputs structure
			console.log('[ComfyUI] Raw outputs structure:', JSON.stringify(promptResult.outputs, null, 2));

			// Collect outputs
			const mediaOutputs = Object.values(promptResult.outputs)
				.flatMap((nodeOutput: any) => nodeOutput.images || nodeOutput.gifs || [])
				.filter((out: any) => out.type === 'output' || out.type === 'temp')
				.map((out: any) => ({
					...out,
					url: `${apiUrl}/view?filename=${out.filename}&subfolder=${out.subfolder || ''}&type=${out.type}`,
				}));

			if (mediaOutputs.length === 0) {
				throw new NodeApiError(this.getNode(), { message: '[ComfyUI] No media outputs found' });
			}

			// Split videos vs images
			const videoOutputs = mediaOutputs.filter(o =>
				o.filename.endsWith('.webp') || o.filename.endsWith('.mp4') || o.filename.endsWith('.gif')
			);
			const imageOutputs = mediaOutputs.filter(o =>
				o.filename.endsWith('.png') || o.filename.endsWith('.jpg') || o.filename.endsWith('.jpeg')
			);

			const results: INodeExecutionData[] = [];

			// Download helper
			const downloadAndWrap = async (output: any, fileType: 'video' | 'image') => {
				const res = await this.helpers.request({
					method: 'GET',
					url: output.url,
					encoding: null,
					resolveWithFullResponse: true,
				});
				if (res.statusCode === 404) {
					throw new NodeApiError(this.getNode(), { message: `File not found at ${output.url}` });
				}

				const buffer = Buffer.from(res.body);
				const base64Data = buffer.toString('base64');
				const fileSize = Math.round(buffer.length / 1024 * 10) / 10 + ' kB';

				let mimeType = 'application/octet-stream';
				if (output.filename.endsWith('.mp4')) mimeType = 'video/mp4';
				else if (output.filename.endsWith('.gif')) mimeType = 'image/gif';
				else if (output.filename.endsWith('.webp')) mimeType = 'image/webp';
				else if (output.filename.endsWith('.png')) mimeType = 'image/png';
				else if (output.filename.endsWith('.jpg') || output.filename.endsWith('.jpeg')) mimeType = 'image/jpeg';

				results.push({
					json: {
						mimeType,
						fileName: output.filename,
						data: base64Data,
						status: promptResult.status,
					},
					binary: {
						data: {
							fileName: output.filename,
							data: base64Data,
							fileType,
							fileSize,
							fileExtension: output.filename.split('.').pop(),
							mimeType,
						},
					},
				});
			};

			// Process videos + images
			for (const v of videoOutputs) await downloadAndWrap(v, 'video');
			for (const i of imageOutputs) await downloadAndWrap(i, 'image');

			return [results];

		} catch (err: any) {
			throw new NodeApiError(this.getNode(), { message: err.message });
		}
	}
}
