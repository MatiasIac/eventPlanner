import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { plainText, textDocument, type RichDocument } from '../shared/richText';

const extensions = [StarterKit.configure({
  blockquote: false, codeBlock: false, heading: false, horizontalRule: false,
  orderedList: false, code: false, link: false, strike: false, underline: false,
})];
export function DetailsEditor({ text, content, disabled, error, onChange }: {
  text: string; content?: RichDocument | null; disabled: boolean; error?: string;
  onChange: (text: string, content: RichDocument) => void;
}) {
  const changed = useRef(onChange); changed.current = onChange;
  const editor = useEditor({
    extensions, content: content ?? textDocument(text), injectCSS: false, immediatelyRender: false,
    editorProps: { attributes: { id: 'description', role: 'textbox', 'aria-label': 'A few helpful details', 'aria-multiline': 'true', class: 'details-input' } },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON() as RichDocument;
      changed.current(plainText(doc), doc);
    },
  });
  const active = useEditorState({ editor, selector: ({ editor }) => ({ bold: editor?.isActive('bold'), italic: editor?.isActive('italic'), list: editor?.isActive('bulletList') }) });
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const next = content ?? textDocument(text);
    // Background refreshes leave the draft alone; explicit conflict reloads
    // arrive as changed props and replace the document without moving each keystroke.
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, content, text]);
  useEffect(() => { if (editor && !editor.isDestroyed) editor.setEditable(!disabled); }, [editor, disabled]);
  const length = text.length, tooLong = length > 1200;
  useEffect(() => { if (editor && !editor.isDestroyed) editor.view.dom.setAttribute('aria-invalid', String(Boolean(error) || tooLong)); }, [editor, error, tooLong]);
  return <div className="field details-field"><label id="details-label" onClick={() => editor?.commands.focus()}>A few helpful details</label>
    <div className={`details-editor ${tooLong || error ? 'invalid' : ''}`}>
      <div className="format-toolbar" role="toolbar" aria-label="Text formatting">
        <button type="button" aria-label="Bold" title="Bold (Ctrl+B)" aria-pressed={Boolean(active?.bold)} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" aria-label="Italic" title="Italic (Ctrl+I)" aria-pressed={Boolean(active?.italic)} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
        <button type="button" aria-label="Bullet list" title="Bullet list" aria-pressed={Boolean(active?.list)} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleBulletList().run()}><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5h10M7 10h10M7 15h10" stroke="currentColor" strokeWidth="1.5"/><circle cx="3" cy="5" r="1" fill="currentColor"/><circle cx="3" cy="10" r="1" fill="currentColor"/><circle cx="3" cy="15" r="1" fill="currentColor"/></svg></button>
      </div><EditorContent editor={editor}/>
    </div>
    <small className={tooLong ? 'field-error' : 'character-count'}>{length}/1,200 characters</small>
    {(error || tooLong) && <small className="field-error" role="alert">{error || 'Please shorten the details to 1,200 characters.'}</small>}
  </div>;
}
