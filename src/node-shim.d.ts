declare module "node:fs/promises" {
  export function readFile(path: string, encoding: string): Promise<string>;
}

declare module "node:path" {
  export function resolve(...paths: string[]): string;
}

declare const process: {
  argv: string[];
  exit(code?: number): never;
};
