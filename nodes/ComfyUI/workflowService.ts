// workflowService.ts
import { ComfyUIWorkflow, ComfyUINode, ImageInfo } from './types';

export class WorkflowService {
	static parse(workflowJson: string): ComfyUIWorkflow {
		try {
			const workflow = JSON.parse(workflowJson);
			if (typeof workflow !== 'object' || workflow === null) {
				throw new Error('Invalid workflow structure');
			}
			return workflow;
		} catch (err: any) {
			throw new Error(`Invalid workflow JSON: ${err.message}`);
		}
	}

	static injectImage(workflow: ComfyUIWorkflow, imageInfo: ImageInfo) {
		const loadImageNode = Object.values(workflow).find(
			(node: ComfyUINode) => node.class_type === 'LoadImage'
		);
		if (!loadImageNode) throw new Error('No LoadImage node found');
		loadImageNode.inputs.image = imageInfo.name;
	}
}
