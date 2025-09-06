import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, NodeOperationError } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { N8nApiClient } from '../ComfyUI/apiClient';
import { EUploadMimeType, TwitterApi } from 'twitter-api-v2';
import { Base64InputProvider, BinaryInputProvider, UrlInputProvider } from '../ComfyUI/inputProviders';


export class XMediaUpload implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'XMediaUpload',
		name: 'xMediaUpload',
		icon: 'file:comfyui.svg',
		group: ['transform'],
		version: 1,
		description: 'Upload Video to X.com',
		defaults: {
			name: 'Upload Video to X.com',
		},
		credentials: [
			{
				name: 'oAuth2Api',
				required: true,
			},
		],
		inputs: ['main'],
		outputs: ['main'],
		properties: [
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

		const meOld = await this.helpers.request("oAuth2Api", {
			method: "GET",
			url: "https://api.x.com/2/users/me"
		});

		console.log("meOld", meOld);

		const credentials = (await this.getCredentials('oAuth2Api')) as any;
		const accessToken = credentials.oauthTokenData?.access_token;

		if (!accessToken) {
				throw new NodeOperationError(this.getNode(), 'No access token available!:' + JSON.stringify(credentials));
		}
		const appOnlyClient = new TwitterApi(accessToken);

		try {
			const me = await appOnlyClient.v2.me();

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

			const uploadMedia = await appOnlyClient.v2.uploadMedia(buffer, {
				media_type: EUploadMimeType.Mp4
			});


			return [this.helpers.returnJsonArray({media: uploadMedia, me})];

		} catch (err: any) {
			throw new NodeApiError(this.getNode(), { message: err.message + " : " + " : " + JSON.stringify(credentials), });
		}
	}
}
