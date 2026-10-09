import assert from "node:assert/strict";
import test from "node:test";

import { assertNotAborted } from "../src/utils/abort.ts";
import { mapSequentially } from "../src/utils/sequential.ts";

test("mapSequentially handles empty iterables without invoking the operation", async () => {
	const result = await mapSequentially([], async () => assert.fail("No operation should start"));
	assert.deepEqual(result, []);
});

test("mapSequentially waits for settlement before starting the next operation and preserves indexes", async () => {
	const started = Promise.withResolvers();
	const release = Promise.withResolvers();
	const events = [];
	const pending = mapSequentially(new Set(["one", "two", "three"]), async (item, index) => {
		events.push(`start ${item}`);
		if (index === 0) {
			started.resolve();
			await release.promise;
		}
		events.push(`finish ${item}`);
		return `${index}:${item}`;
	});
	await started.promise;
	try {
		assert.deepEqual(events, ["start one"]);
	} finally {
		release.resolve();
	}
	assert.deepEqual(await pending, ["0:one", "1:two", "2:three"]);
	assert.deepEqual(events, ["start one", "finish one", "start two", "finish two", "start three", "finish three"]);
});

test("mapSequentially stops on rejected operations without starting later work", async () => {
	const failure = new Error("Second operation failed");
	const started = [];
	await assert.rejects(() => mapSequentially([1, 2, 3], async (item) => {
		started.push(item);
		if (item === 2) throw failure;
		return item;
	}), (error) => error === failure);
	assert.deepEqual(started, [1, 2]);
});

test("mapSequentially propagates synchronous callback failures and closes the input iterator", async () => {
	const failure = new Error("Operation failed before creating a promise");
	const state = { closed: false };
	await assert.rejects(() => mapSequentially(cleanupIterator(state), () => { throw failure; }), (error) => error === failure);
	assert.equal(state.closed, true);
});

function* cleanupIterator(state) {
	try {
		yield 1;
		yield 2;
	} finally {
		state.closed = true;
	}
}

test("mapSequentially preserves abort checkpoints between operations", async () => {
	const controller = new AbortController();
	const completed = [];
	await assert.rejects(() => mapSequentially([1, 2, 3], async (item) => {
		assertNotAborted(controller.signal);
		completed.push(item);
		controller.abort();
	}), (error) => error.code === "github_request_aborted");
	assert.deepEqual(completed, [1]);
});
