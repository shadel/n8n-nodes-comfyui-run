import { IApiClient } from "./apiClient";

// poller.ts
export class Poller {
	constructor(private api: IApiClient, private apiUrl: string, private headers: Record<string,string>) {}

	async waitForCompletion(promptId: string, timeout: number): Promise<any> {
		let attempts = 0;
		const maxAttempts = 60 * timeout;

		while (attempts < maxAttempts) {
			await new Promise(r => setTimeout(r, 10000));
			attempts++;

			const history = await this.api.request<any>({
				method: 'GET',
				url: `${this.apiUrl}/history/${promptId}`,
				headers: this.headers,
				json: true,
			});

			const result = history[promptId];
			if (result?.status?.completed) return result;
		}
		throw new Error(`Timeout after ${timeout} minutes`);
	}
}
