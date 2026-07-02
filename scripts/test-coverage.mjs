#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const rootPath = fileURLToPath(new URL("../", import.meta.url));

await mkdir(new URL("../coverage/", import.meta.url), { recursive: true });

const child = spawn(
  process.execPath,
  [
    "--test",
    "--experimental-test-coverage",
    "--test-coverage-include=src/**/*.ts",
    "--test-reporter=spec",
    "--test-reporter=lcov",
    "--test-reporter-destination=stdout",
    "--test-reporter-destination=coverage/lcov.info",
    "test/*.test.mjs",
  ],
  {
    cwd: rootPath,
    stdio: "inherit",
  },
);

const exitCode = await new Promise((resolve) => {
  child.on("error", (error) => {
    console.error(`Failed to start coverage test run: ${error instanceof Error ? error.message : String(error)}`);
    resolve(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`Coverage test run terminated by ${signal}.`);
      resolve(1);
      return;
    }

    resolve(code ?? 1);
  });
});

process.exitCode = exitCode;
