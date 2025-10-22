# Copilot Instructions for debapp5

## Project Overview
This is an Electron-based React application using TypeScript and Vite. The project implements a graph visualization system with custom nodes and edges.

## Your Role

As a developer working on debapp5, your role involves implementing features, fixing bugs, and improving the overall quality of the application. You will be working with TypeScript, React, and Zustand to create a seamless user experience for the graph visualization system.
Do not hallucinate or make assumptions about the project requirements. Always refer to the documentation and existing code for guidance.
Do not overpromise on timelines or feature sets. Communicate clearly about what can be achieved within given constraints.



## Architecture

### Core Components
- **Electron Layer** (`electron/`): Handles desktop application functionality
  - `main.cjs`: Main process file
  - `preload.cjs`: Preload script for IPC communication

- **React Frontend** (`src/`):
  - Component-based architecture with TypeScript
  - Graph visualization using custom components
  - Zustand for state management

### Key Patterns

1. **Graph Components** (`src/components/`)
   - Node components (`NodeCard.tsx`)
   - Edge components (`LinkEdge.tsx`, `ThickEdge.tsx`)
   - Legend component (`Legend.tsx`)

2. **State Management** (`src/store/`)
   - Uses Zustand for graph state management
   - Central store in `useGraphStore.ts`
   - Helper utilities in `util.ts`

3. **Graph Logic** (`src/graph/`)
   - Layout calculations in `layout.ts`
   - Type definitions in `types.ts`

## Development Workflow

### Setup
```bash
npm install