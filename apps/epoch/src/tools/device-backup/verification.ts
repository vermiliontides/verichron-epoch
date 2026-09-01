import { createHash } from 'crypto';
import fs from 'fs';

/** Node's crypto supports many more than this, but these are the ones
 * worth exposing in a checksum-verification UI -- sha256 as the practical
 * default, sha512 and blake2b512 for projects that publish those instead. */
export type ChecksumAlgorithm = 'sha256' | 'sha512' | 'blake2b512';

export interface ExpectedChecksum {
  algorithm: ChecksumAlgorithm;
  /** Lowercase hex digest, as published by the release. */
  value: string;
}

export interface ChecksumVerificationResult {
  algorithm: ChecksumAlgorithm;
  expected: string;
  actual: string;
  matches: boolean;
}

/** Hashes `filePath` with `algorithm` and compares against `expected.value`.
 * Case-insensitive on the hex digest, since published checksums aren't
 * consistently cased across projects. Streams the file rather than reading
 * it fully into memory -- release binaries can be large enough that this
 * matters. */
export function verifyChecksum(filePath: string, expected: ExpectedChecksum): Promise<ChecksumVerificationResult> {
  return new Promise((resolve, reject) => {
    const hash = createHash(expected.algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const actual = hash.digest('hex').toLowerCase();
      resolve({
        algorithm: expected.algorithm,
        expected: expected.value.toLowerCase(),
        actual,
        matches: actual === expected.value.toLowerCase(),
      });
    });
  });
}

/** Verifies against every provided checksum and requires all of them to
 * match -- a release manifest listing both sha256 and sha512 means both
 * should hold, not just one, since the point of listing more than one is
 * defense against a single broken/compromised digest. */
export async function verifyAllChecksums(
  filePath: string,
  expectedChecksums: ExpectedChecksum[]
): Promise<{ allMatch: boolean; results: ChecksumVerificationResult[] }> {
  const results = await Promise.all(expectedChecksums.map((c) => verifyChecksum(filePath, c)));
  return { allMatch: results.every((r) => r.matches), results };
}
