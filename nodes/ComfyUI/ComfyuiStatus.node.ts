import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { N8nApiClient } from './apiClient';

export class ComfyuiStatus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ComfyUI Status',
		name: 'comfyuiStatus',
		group: ['transform'],
		version: 1,
		description: 'Check if a ComfyUI server is ready',
		defaults: {
			name: 'ComfyUI Status',
		},
		credentials: [
			{
				name: 'comfyUIApi',
				required: true,
			},
		],
		inputs: ['main'],
		outputs: ['main'],
		properties: [],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const api = new N8nApiClient(this.helpers);
		const credentials = await this.getCredentials('comfyUIApi');
		const apiUrl = credentials.apiUrl as string;
		const apiKey = credentials.apiKey as string;
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

		try {
			const response = await api.request<any>({
				method: 'GET',
				url: `${apiUrl}`,
				headers,
				json: true,
			});

			return [
				this.helpers.returnJsonArray({
					ready: true,
					data: response,
				}),
			];
		} catch (error) {
			return [
				this.helpers.returnJsonArray({
					ready: false,
					error: (error as Error).message,
				}),
			];
		}
	}
}
