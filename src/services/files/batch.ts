import type { OpenedFile } from "./platform";

export interface FileBatch {
  files: OpenedFile[];
  failed: string[];
}

/** Keep readable files in selection order, even when another read fails. */
export async function readBatch<T>(
  inputs: readonly T[],
  read: (input: T) => Promise<OpenedFile>,
  name: (input: T) => string,
): Promise<FileBatch> {
  const results = await Promise.allSettled(inputs.map(async (input) => read(input)));
  const batch: FileBatch = { files: [], failed: [] };
  results.forEach((result, index) => {
    if (result.status === "fulfilled") batch.files.push(result.value);
    else batch.failed.push(name(inputs[index]));
  });
  return batch;
}
