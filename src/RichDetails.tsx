import { Fragment, type ReactNode } from 'react';
import { isRichDocument, type RichNode, type RichDocument } from '../shared/richText';
function render(node: RichNode, key: number): ReactNode {
  const children = node.content?.map(render);
  switch (node.type) {
    case 'text': {
      let text: ReactNode = node.text;
      if (node.marks?.some(mark => mark.type === 'italic')) text = <em>{text}</em>;
      if (node.marks?.some(mark => mark.type === 'bold')) text = <strong>{text}</strong>;
      return <Fragment key={key}>{text}</Fragment>;
    }
    case 'paragraph': return <p key={key}>{children ?? <br/>}</p>;
    case 'hardBreak': return <br key={key}/>;
    case 'bulletList': return <ul key={key}>{children}</ul>;
    case 'listItem': return <li key={key}>{children}</li>;
    default: return null;
  }
}
export function RichDetails({ text, content }: { text: string; content?: RichDocument | null }) {
  if (!text && !content) return null;
  return <div className="description rich-details">{isRichDocument(content) ? content.content.map(render) : <p>{text}</p>}</div>;
}
