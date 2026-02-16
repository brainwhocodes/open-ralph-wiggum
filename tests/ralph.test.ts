import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { checkCompletion } from "../promise-detection";

const repoRoot = resolve(import.meta.dir, "..");
const cliPath = join(repoRoot, "ralph.ts");

function runRalph(args: string[], cwd = repoRoot) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, cliPath, ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ralph-test-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ralph CLI", () => {
  test("prints version with --version", () => {
    const { exitCode, stdout, stderr } = runRalph(["--version"]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.trim()).toMatch(/^ralph\s+\d+\.\d+\.\d+$/);
  });

  test("prints usage with --help", () => {
    const { exitCode, stdout } = runRalph(["--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("--agent AGENT");
    expect(stdout).toContain("--status");
  });

  test("supports add/list/remove task workflow", () => {
    const cwd = makeTempDir();

    const addResult = runRalph(["--add-task", "Write unit tests"], cwd);
    expect(addResult.exitCode).toBe(0);
    expect(addResult.stdout).toContain("✅ Task added: \"Write unit tests\"");

    const tasksFilePath = join(cwd, ".ralph", "ralph-tasks.md");
    expect(existsSync(tasksFilePath)).toBe(true);
    expect(readFileSync(tasksFilePath, "utf-8")).toContain("- [ ] Write unit tests");

    const listResult = runRalph(["--list-tasks"], cwd);
    expect(listResult.exitCode).toBe(0);
    expect(listResult.stdout).toContain("Write unit tests");

    const removeResult = runRalph(["--remove-task", "1"], cwd);
    expect(removeResult.exitCode).toBe(0);
    expect(removeResult.stdout).toContain("✅ Removed task 1 and its subtasks");

    expect(readFileSync(tasksFilePath, "utf-8")).not.toContain("Write unit tests");
  });
});

describe("completion promise detection", () => {
  test("does not match raw promise text without tags", () => {
    const output = "I am not outputting a completion promise: ALL_PHASE2_TASKS_DONE";
    expect(checkCompletion(output, "ALL_PHASE2_TASKS_DONE")).toBe(false);
  });

  test("does not match promise tags embedded in prose", () => {
    const output = "When complete, output <promise>ALL_PHASE2_TASKS_DONE</promise> and continue.";
    expect(checkCompletion(output, "ALL_PHASE2_TASKS_DONE")).toBe(false);
  });

  test("matches a standalone promise tag", () => {
    const output = "Work finished.\n<promise>ALL_PHASE2_TASKS_DONE</promise>\n";
    expect(checkCompletion(output, "ALL_PHASE2_TASKS_DONE")).toBe(true);
  });

  test("does not match promise tag inside fenced markdown code blocks", () => {
    const output = [
      "Here is the required format:",
      "```xml",
      "<promise>ALL_PHASE2_TASKS_DONE</promise>",
      "```",
    ].join("\n");

    expect(checkCompletion(output, "ALL_PHASE2_TASKS_DONE")).toBe(false);
  });

  test("matches promise tag after fenced markdown block closes", () => {
    const output = [
      "Example:",
      "```xml",
      "<promise>ALL_PHASE2_TASKS_DONE</promise>",
      "```",
      "",
      "<promise>ALL_PHASE2_TASKS_DONE</promise>",
    ].join("\n");

    expect(checkCompletion(output, "ALL_PHASE2_TASKS_DONE")).toBe(true);
  });
});
