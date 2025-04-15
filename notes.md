# n8n-nodes-comfyui-image-to-video Documentation

## Project Overview
This is an n8n node package that provides integration with ComfyUI, a powerful and modular stable diffusion GUI with a graph/nodes interface. The package allows users to execute ComfyUI workflows directly from n8n and retrieve generated images.

## Technical Details

### Version Information
- Package Version: 0.0.6
- Node.js Requirement: >=18.10
- pnpm Requirement: >=9.1
- Package Manager: pnpm@9.1.4

### Project Structure
```
.
├── .git/                    # Git repository
├── nodes/                   # Node implementations
│   └── ComfyUI/
│       ├── comfyui.svg     # Node icon
│       └── Comfyui.node.ts # Main node implementation
├── credentials/            # Credential implementations
│   └── ComfyUIApi.credentials.ts
├── package.json           # Project configuration
├── tsconfig.json          # TypeScript configuration
├── tslint.json            # TypeScript linting rules
├── gulpfile.js            # Build tasks
├── README.md              # Project documentation
├── LICENSE.md             # MIT License
└── Various config files   # ESLint, Prettier, etc.
```

### Main Components

#### 1. ComfyUI Node (Comfyui.node.ts)
- **Purpose**: Executes ComfyUI workflows and processes generated images
- **Features**:
  - JSON workflow execution
  - Image format selection (JPEG/PNG)
  - Configurable JPEG quality (1-100)
  - Configurable timeout
  - Progress monitoring
  - Error handling
- **Outputs**:
  - Base64 encoded images
  - Image metadata (filename, type, subfolder)
  - Binary data for n8n

#### 2. ComfyUI API Credentials (ComfyUIApi.credentials.ts)
- **Purpose**: Manages API connection to ComfyUI
- **Configuration**:
  - API URL (default: http://127.0.0.1:8188)
  - Optional API key
- **Features**:
  - API connection testing
  - Secure credential storage

### Development Setup

#### Build System
- Uses Gulp for build tasks
- Main task: `build:icons` - Copies icons to dist directory
- TypeScript compilation
- ESLint and Prettier for code quality

#### Dependencies
- Main Dependencies:
  - n8n-workflow: * (peer dependency)
- Dev Dependencies:
  - TypeScript
  - ESLint
  - Prettier
  - Gulp

#### Scripts
- `build`: Compiles TypeScript and builds icons
- `dev`: TypeScript watch mode
- `format`: Formats code with Prettier
- `lint`: Runs ESLint
- `lintfix`: Fixes ESLint issues
- `prepublishOnly`: Build and lint before publishing

### Usage

#### Installation
```bash
npm install n8n-nodes-comfyui-image-to-video
```

#### Node Configuration
1. Set up ComfyUI API credentials
2. Configure node with:
   - Workflow JSON
   - Output format (JPEG/PNG)
   - JPEG quality (if using JPEG)
   - Timeout duration

#### Workflow Integration
1. Export workflow from ComfyUI as JSON
2. Add ComfyUI node to n8n workflow
3. Configure node settings
4. Execute and process outputs

### Error Handling
The node includes comprehensive error handling for:
- API connection issues
- Invalid workflow JSON
- Execution failures
- Timeout conditions
- Image processing errors

### Development Guidelines
- Follow TypeScript best practices
- Maintain code quality with ESLint and Prettier
- Test API connectivity
- Handle all error cases
- Provide clear logging

### License
MIT License - See LICENSE.md for details

### Author
- Name: christiankuri
- Email: mintedwealth.es@gmail.com
- Repository: https://github.com/christiankuri/n8n-nodes-comfyui-image-to-video.git 