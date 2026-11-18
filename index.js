/**
 * Host half of the emoji panel bundle.
 *
 * The Client module (`client.js`) owns every visible part: the trigger button in
 * `conversation.input.left` and the popover in `conversation.input.overlay`.
 * This half only has to exist so the Loader can insert the row and activate the
 * bundle, so it registers nothing and needs no dependencies.
 */
export function apply() {}
