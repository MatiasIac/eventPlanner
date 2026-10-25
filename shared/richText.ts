/** A deliberately small document format. Stored text is never rendered as HTML. */
export type RichNode = {
  type: 'doc' | 'paragraph' | 'bulletList' | 'listItem' | 'text' | 'hardBreak';
  content?: RichNode[]; text?: string; marks?: { type: 'bold' | 'italic' }[];
};
export type RichDocument = RichNode & { type: 'doc'; content: RichNode[] };
export function plainText(node: RichNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(plainText).join(node.type === 'paragraph' ? '' : '\n');
}
export function textDocument(text: string): RichDocument {
  return { type: 'doc', content: text.split('\n').map(line => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) };
}
export function isRichDocument(value: unknown): value is RichDocument {
  if (!value || typeof value !== 'object' || (value as RichNode).type !== 'doc') return false;
  const queue: { node: any; depth: number; parent?: string }[] = [{ node: value, depth: 0 }];
  let nodes = 0;
  while (queue.length) {
    const { node, depth, parent } = queue.pop()!;
    if (++nodes > 400 || depth > 8 || !node || typeof node !== 'object' || Array.isArray(node)) return false;
    if (Object.keys(node).some(key => !['type','content','text','marks'].includes(key))) return false;
    const allowed = parent === 'paragraph' ? ['text','hardBreak'] : parent === 'bulletList' ? ['listItem'] : parent ? ['paragraph','bulletList'] : ['doc'];
    if (!allowed.includes(node.type)) return false;
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || !node.text.length || node.content !== undefined) return false;
      if (node.marks !== undefined && (!Array.isArray(node.marks) || node.marks.length > 2 || node.marks.some((mark: any) => !mark || Object.keys(mark).length !== 1 || !['bold','italic'].includes(mark.type)))) return false;
    } else {
      if (node.text !== undefined || node.marks !== undefined) return false;
      if (node.type === 'hardBreak') { if (node.content !== undefined) return false; continue; }
      if (node.content !== undefined && !Array.isArray(node.content)) return false;
      if (node.type !== 'paragraph' && !node.content?.length) return false;
      if (node.type === 'listItem' && node.content[0]?.type !== 'paragraph') return false;
      for (const child of node.content ?? []) queue.push({ node: child, depth: depth + 1, parent: node.type });
    }
  }
  return plainText(value as RichDocument).length <= 1200;
}
