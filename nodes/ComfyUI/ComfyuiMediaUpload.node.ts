// comfyuiVideoToVideo.ts
import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import FormData from 'form-data';
import { N8nApiClient } from './apiClient';
import { UrlInputProvider, Base64InputProvider, BinaryInputProvider } from './inputProviders';

export class ComfyuiMediaUpload implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ComfyUI Media Upload',
		name: 'comfyuiMediaUpload',
		icon: 'file:comfyui.svg',
		group: ['transform'],
		version: 1,
		description: 'Media Upload to ComfyUI server',
		defaults: {
			name: 'ComfyUI Media Upload',
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
				displayName: 'Filename',
				name: 'filename',
				type: 'string',
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
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const api = new N8nApiClient(this.helpers);
		const credentials = await this.getCredentials('comfyUIApi');
		const apiUrl = credentials.apiUrl as string;
		const apiKey = credentials.apiKey as string;
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

		const filename = this.getNodeParameter('filename', 0) as string;

		try {
			// Choose input strategy
			const inputType = this.getNodeParameter('inputType', 0) as string;
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
			formData.append('image', buffer, filename);
			formData.append('subfolder', '');
			formData.append('overwrite', 'true');

			const uploadResponse = await api.request<string>({
				method: 'POST',
				url: `${apiUrl}/upload/image`,
				headers: { ...headers, ...formData.getHeaders() },
				body: formData,
			});

			const imageInfo = JSON.parse(uploadResponse);

			return [[{
				json: {
					fileName: imageInfo.name,
				}
			}]];

		} catch (err: any) {
			throw new NodeApiError(this.getNode(), { message: err.message });
		}
	}
}
