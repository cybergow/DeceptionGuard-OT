export type TargetExecutionMode =
  | 'builtin_simulator'
  | 'remote_http_proxy'
  | 'local_process_bridge';

export interface TargetConnectionConfig {
  mode: TargetExecutionMode;
  baseUrl: string;
  authType: 'none' | 'bearer' | 'api_key';
  authToken: string;
  customHeaderName: string;
  customHeaderValue: string;
  timeoutMs: number;
  localProcessPort: number;
  enforcePrivateLabSubnet: boolean;
}

export interface PingHandshakeResult {
  reachable: boolean;
  targetUrl: string;
  roundTripLatencyMs: number;
  statusCode: number;
  subnetAllowed: boolean;
  subnetRationale: string;
  detectedEndpoints: string[];
  serviceBanner: string;
  timestamp: string;
  errorMessage?: string;
}

export interface ProcessLogEntry {
  id: string;
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'network';
  line: string;
}

export interface ManagedProcessStatus {
  running: boolean;
  pid: number | null;
  port: number;
  baseUrl: string;
  startedAt: string | null;
  uptimeSeconds: number;
  requestCount: number;
  logs: ProcessLogEntry[];
}

export const DEFAULT_TARGET_CONFIG: TargetConnectionConfig = {
  mode: 'builtin_simulator',
  baseUrl: 'http://127.0.0.1:4040',
  authType: 'none',
  authToken: '',
  customHeaderName: 'X-OT-Lab-Session',
  customHeaderValue: 'WT-SECTOR-04-AUDIT',
  timeoutMs: 3000,
  localProcessPort: 4040,
  enforcePrivateLabSubnet: true,
};

export function validateLabTargetSubnet(
  rawUrl: string,
  enforcePrivateLabSubnet: boolean
): { validUrl: boolean; subnetAllowed: boolean; hostname: string; rationale: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        validUrl: false,
        subnetAllowed: false,
        hostname: '',
        rationale: 'Protocol must be http:// or https://',
      };
    }
    const host = parsed.hostname.toLowerCase();
    const isLoopback =
      host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('127.');
    const isRfc1918 =
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal');

    if (isLoopback || isRfc1918) {
      return {
        validUrl: true,
        subnetAllowed: true,
        hostname: host,
        rationale: `Authorized isolated lab/loopback target (${host}).`,
      };
    }

    if (enforcePrivateLabSubnet) {
      return {
        validUrl: true,
        subnetAllowed: false,
        hostname: host,
        rationale: `Blocked by Section 15 Ethics & Containment Policy: "${host}" is outside loopback (127.0.0.0/8) and private lab RFC1918 subnets.`,
      };
    }

    return {
      validUrl: true,
      subnetAllowed: true,
      hostname: host,
      rationale: `External lab host "${host}" permitted via explicit override.`,
    };
  } catch {
    return {
      validUrl: false,
      subnetAllowed: false,
      hostname: '',
      rationale: 'Invalid URL format. Example: http://127.0.0.1:4040',
    };
  }
}
