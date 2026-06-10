// lucide-react@1.x ships NO TypeScript declarations and exposes one export
// per icon, so a typed shim can't enumerate them all. Declaring the module
// loosely lets every import — named (`import { Menu, X } from 'lucide-react'`)
// or default — resolve as `any`, keeping the IDE/tsc clean. Vite/esbuild
// strip the types at build time anyway.
declare module 'lucide-react';
