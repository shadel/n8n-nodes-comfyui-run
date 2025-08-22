import { IApiClient } from "./apiClient";

// inputProviders.ts
export interface IInputProvider {
	getBuffer(): Promise<Buffer>;
}

export class UrlInputProvider implements IInputProvider {
	constructor(private api: IApiClient, private url: string) {}
	async getBuffer(): Promise<Buffer> {
		const response = await this.api.request({ method: 'GET', url: this.url, encoding: null });
		return Buffer.from(response as any);
	}
}

export class Base64InputProvider implements IInputProvider {
	constructor(private base64: string) {}
	async getBuffer(): Promise<Buffer> {
		return Buffer.from(this.base64, 'base64');
	}
}

export class BinaryInputProvider implements IInputProvider {
	constructor(private helpers: any, private binaryProperty: string, private items: any[]) {}
	async getBuffer(): Promise<Buffer> {
		let propertyName = this.binaryProperty;
		if (!this.items[0].binary?.[propertyName]) {
			const fallback = Object.keys(this.items[0].binary || {})
				.find(k => this.items[0].binary[k].mimeType?.startsWith('image/'));
			if (!fallback) throw new Error(`No valid binary property found`);
			propertyName = fallback;
		}
		return this.helpers.getBinaryDataBuffer(0, propertyName);
	}
}
