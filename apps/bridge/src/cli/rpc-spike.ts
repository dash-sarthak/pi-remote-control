/**
 * `pnpm --filter @pirc/bridge rpc-spike [--cwd DIR] [--provider P] [--model M] PROMPT`
 *
 * Phase 1 proof that the bridge can drive `pi --mode rpc`: starts pi, sends
 * one prompt, prints the assistant's reply to stdout as it streams, and exits
 * once pi settles. Structured logs go to stderr. See RUNBOOK.md.
 *
 * Exit codes: 0 success, 1 pi failed or reported an error, 2 bad usage.
 */
import { parseArgs } from 'node:util';
import { createLogger } from '../logging/logger.js';
import { PiRpcClient } from '../pi-rpc/client.js';
import { runPrompt } from '../pi-rpc/prompt-run.js';

const USAGE = 'usage: rpc-spike [--cwd DIR] [--provider NAME] [--model ID] PROMPT';

/** Parsed command line of the spike. */
interface SpikeArgs {
  readonly prompt: string;
  readonly cwd: string | undefined;
  readonly provider: string | undefined;
  readonly model: string | undefined;
}

/**
 * Parses `argv` (without the node and script entries).
 *
 * @returns The arguments, or the reason they do not form a valid invocation.
 */
function parseSpikeArgs(argv: readonly string[]): SpikeArgs | { readonly invalid: string } {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: { cwd: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' } },
    });
    const prompt = positionals.join(' ').trim();
    if (prompt.length === 0) return { invalid: 'no prompt given' };
    return { prompt, cwd: values.cwd, provider: values.provider, model: values.model };
  } catch (error) {
    return { invalid: error instanceof Error ? error.message : String(error) };
  }
}

/** Runs the spike and returns the process exit code. */
async function main(argv: readonly string[]): Promise<number> {
  const logger = createLogger({ component: 'rpc-spike' });
  const args = parseSpikeArgs(argv);
  if ('invalid' in args) {
    logger.error({ argv, reason: args.invalid }, USAGE);
    return 2;
  }
  const piArgs = ['--mode', 'rpc', '--no-session'];
  if (args.provider !== undefined) piArgs.push('--provider', args.provider);
  if (args.model !== undefined) piArgs.push('--model', args.model);

  let client: PiRpcClient | undefined;
  try {
    client = await PiRpcClient.start({
      command: process.env.PIRC_PI_COMMAND ?? 'pi',
      args: piArgs,
      logger,
      ...(args.cwd === undefined ? {} : { cwd: args.cwd }),
    });
    const result = await runPrompt(client, args.prompt, {
      onTextDelta: (delta) => process.stdout.write(delta),
    });
    if (result.text.length > 0) process.stdout.write('\n');
    logger.info(
      {
        disposition: result.disposition,
        aborted: result.aborted,
        errorMessage: result.errorMessage,
        chars: result.text.length,
      },
      'prompt settled',
    );
    return result.aborted || result.errorMessage !== undefined ? 1 : 0;
  } catch (error) {
    logger.error({ err: error }, 'rpc-spike failed');
    return 1;
  } finally {
    await client?.close();
  }
}

process.exitCode = await main(process.argv.slice(2));
