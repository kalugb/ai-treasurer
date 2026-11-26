// Self-check for groupReceipts. Run from frontend/:  bun src/api/receiptGroups.check.js
import assert from 'node:assert/strict'
import { groupReceipts } from './receipts.js'

const r = (id, filename, extra = {}) => ({ id, filename, amount: 0, source: 'google', ...extra })
const list = [
	r('a', 'part 10.jpg', { groupName: 'Trip', amount: 10 }),
	r('b', 'lunch.jpg', { amount: 5 }),
	r('c', 'part 2.jpg', { groupName: ' trip ', amount: 20 }),
	r('d', 'dup.jpg', { groupName: 'Trip', amount: 99, duplicate: { excluded: true } }),
	r('e', 'solo.jpg', { groupName: 'Solo', amount: 1 }),
]
const items = groupReceipts(list)

assert.equal(groupReceipts([]).length, 0)
assert.deepEqual(groupReceipts([r('x', 'x.jpg')]).map((i) => i.type), ['receipt'], 'no name = alone')
assert.deepEqual(items.map((i) => i.type), ['group', 'receipt', 'group'], 'group sits at its first member, order kept')
const trip = items[0]
assert.equal(trip.name, 'Trip')
assert.deepEqual(trip.members.map((m) => m.id), ['d', 'c', 'a'], 'natural filename order: dup, part 2, part 10')
assert.equal(trip.total, 30, 'confirmed duplicate left out of the total')
assert.equal(items[2].members.length, 1, 'a named one-receipt group is still a group')
assert.equal(items[2].total, 1)
console.log('receipt group checks passed')
