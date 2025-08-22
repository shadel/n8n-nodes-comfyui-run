// types.ts

export interface ComfyUINode {
	inputs: Record<string, any>;
	class_type: string;
	_meta?: {
		title: string;
	};
}

export interface ComfyUIWorkflow {
	[key: string]: ComfyUINode;
}

export interface ImageInfo {
	name: string;
	subfolder: string;
	type: string;
}
