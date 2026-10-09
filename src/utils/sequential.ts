/** Map one item at a time, preserving order and stopping before the next operation on failure.
 * Use for dependent mutations or to cap GitHub requests and file handles at one in flight.
 */
export async function mapSequentially<Input, Output>(
	items: Iterable<Input>,
	operation: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
	const results: Output[] = [];
	for await (const result of sequentialResults(items, operation)) results.push(result);
	return results;
}

async function* sequentialResults<Input, Output>(
	items: Iterable<Input>,
	operation: (item: Input, index: number) => Promise<Output>,
): AsyncGenerator<Awaited<Output>> {
	let index = 0;
	for (const item of items) yield operation(item, index++);
}
