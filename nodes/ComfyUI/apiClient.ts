// apiClient.ts
export interface IApiClient {
	request<T>(options: any): Promise<T>;
}

export class N8nApiClient implements IApiClient {
	constructor(private helpers: any) {}
	async request<T>(options: any): Promise<T> {
		return this.helpers.request(options);
	}
}
