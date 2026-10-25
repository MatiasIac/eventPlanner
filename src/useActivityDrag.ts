import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type TouchEvent } from 'react';
import type { Activity } from '../shared/model';
import type { Placement } from '../shared/schedule';
type Destination = { activity: Activity; position: 'before' | 'after' };
type Moving = { activity: Activity; revision: number; kind: 'native' | 'keyboard' | 'touch'; gap: number; originalGap: number };
const interactive = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button,a,input,textarea,select,summary,details'));

export function useActivityDrag(activities: Activity[], revision: number, onMove: (activity: Activity, revision: number, placement: Placement) => void) {
  const [id, setId] = useState<string | null>(null), [destination, setDestination] = useState<Destination | null>(null);
  const moving = useRef<Moving | null>(null), target = useRef<Destination | null>(null);
  const list = useRef(activities); list.current = activities;
  const callback = useRef(onMove); callback.current = onMove;
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const mouseBlocked = useRef(false), ignoreClickUntil = useRef(0);
  function mark(next: Destination | null) {
    if (next?.activity.id === target.current?.activity.id && next?.position === target.current?.position) return;
    target.current = next; setDestination(next);
  }
  function cancel() {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null; pointer.current = null; moving.current = null; setId(null); mark(null);
  }
  function begin(activity: Activity, kind: Moving['kind']) {
    const gap = list.current.findIndex(a => a.id === activity.id);
    moving.current = { activity, revision, kind, gap, originalGap: gap }; setId(activity.id); mark(null);
  }
  function finish() {
    const source = moving.current, drop = target.current;
    cancel();
    if (source && drop && source.activity.id !== drop.activity.id)
      callback.current(source.activity, source.revision, { mode: 'relative', anchor_id: drop.activity.id, position: drop.position });
  }
  function locate(activity: Activity, y: number, element: Element) {
    if (!moving.current) return;
    if (moving.current.activity.id === activity.id) { mark(null); return; }
    const box = element.getBoundingClientRect();
    mark({ activity, position: y < box.top + box.height / 2 ? 'before' : 'after' });
  }
  function touchTarget() {
    const point = pointer.current; if (!point) return;
    const element = document.elementFromPoint(point.x, point.y);
    const zone = element?.closest<HTMLElement>('[data-drop-target]');
    if (zone) {
      const [position, activityId] = zone.dataset.dropTarget!.split(':');
      const activity = list.current.find(a => a.id === activityId);
      mark(activity && activity.id !== moving.current?.activity.id ? { activity, position: position as 'before' | 'after' } : null);
      return;
    }
    const card = element?.closest<HTMLElement>('.activity-card'), article = card?.closest<HTMLElement>('[data-activity-id]');
    const activity = list.current.find(a => a.id === article?.dataset.activityId);
    if (card && activity) locate(activity, point.y, card); else mark(null);
  }
  useEffect(() => {
    let frame = 0;
    const scroll = () => {
      if (moving.current?.kind !== 'touch' || !pointer.current) return;
      const y = pointer.current.y;
      if (y < 65 || y > innerHeight - 65) { window.scrollBy(0, y < 65 ? -12 : 12); touchTarget(); }
      frame = requestAnimationFrame(scroll);
    };
    const move = (e: globalThis.TouchEvent) => {
      const point = e.touches[0]; if (!point) return;
      if (moving.current?.kind === 'touch') {
        e.preventDefault(); pointer.current = { x: point.clientX, y: point.clientY }; touchTarget();
        if (!frame) frame = requestAnimationFrame(scroll);
      } else if (press.current && Math.hypot(point.clientX - press.current.x, point.clientY - press.current.y) > 8) {
        clearTimeout(press.current.timer); press.current = null;
      }
    };
    const end = (e: globalThis.TouchEvent) => {
      cancelAnimationFrame(frame); frame = 0;
      if (moving.current?.kind === 'touch') { e.preventDefault(); ignoreClickUntil.current = Date.now() + 400; finish(); }
      else if (press.current) { clearTimeout(press.current.timer); press.current = null; }
    };
    const aborted = () => { cancelAnimationFrame(frame); frame = 0; cancel(); };
    const escape = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && moving.current) { e.preventDefault(); cancel(); } };
    document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', end, { passive: false }); document.addEventListener('touchcancel', aborted);
    document.addEventListener('keydown', escape);
    return () => {
      cancelAnimationFrame(frame); if (press.current) clearTimeout(press.current.timer);
      document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', aborted); document.removeEventListener('keydown', escape);
    };
  }, []);
  function key(e: KeyboardEvent, activity: Activity) {
    if (e.target !== e.currentTarget) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); if (moving.current?.kind === 'keyboard') finish(); else begin(activity, 'keyboard');
    } else if (moving.current?.kind === 'keyboard' && ['ArrowUp','ArrowDown'].includes(e.key)) {
      e.preventDefault(); const source = moving.current, others = list.current.filter(a => a.id !== source.activity.id);
      source.gap = Math.max(0, Math.min(others.length, source.gap + (e.key === 'ArrowUp' ? -1 : 1)));
      if (!others.length || source.gap === source.originalGap) { mark(null); return; }
      const next = others[Math.min(source.gap, others.length - 1)];
      mark({ activity: next, position: source.gap === others.length ? 'after' : 'before' });
      document.querySelector(`[data-activity-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }
  function cardProps(activity: Activity, enabled: boolean) {
    return {
      draggable: enabled, tabIndex: enabled ? 0 : undefined,
      'aria-describedby': enabled ? 'drag-instructions' : undefined,
      onMouseDownCapture: (e: React.MouseEvent) => { mouseBlocked.current = interactive(e.target); },
      onClickCapture: (e: React.MouseEvent) => { if (Date.now() < ignoreClickUntil.current) { e.preventDefault(); e.stopPropagation(); } },
      onContextMenu: (e: React.MouseEvent) => { if (press.current || moving.current?.kind === 'touch') e.preventDefault(); },
      onDragStart: (e: DragEvent) => {
        if (!enabled || mouseBlocked.current || moving.current?.kind === 'touch' || interactive(e.target)) { e.preventDefault(); return; }
        begin(activity, 'native'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', activity.id);
      },
      onDragEnd: cancel,
      onDragOver: (e: DragEvent) => { if (moving.current) { e.preventDefault(); e.dataTransfer.dropEffect = activity.id === moving.current.activity.id ? 'none' : 'move'; locate(activity, e.clientY, e.currentTarget); } },
      onDrop: (e: DragEvent) => { if (moving.current) { e.preventDefault(); locate(activity, e.clientY, e.currentTarget); finish(); } },
      onKeyDown: (e: KeyboardEvent) => { if (enabled) key(e, activity); },
      onTouchStart: (e: TouchEvent) => {
        if (!enabled || interactive(e.target) || e.touches.length !== 1) return;
        const point = e.touches[0];
        press.current = { x: point.clientX, y: point.clientY, timer: setTimeout(() => { begin(activity, 'touch'); pointer.current = { x: point.clientX, y: point.clientY }; }, 400) };
      },
    };
  }
  function zoneProps(activity: Activity, position: 'before' | 'after') {
    return {
      onDragOver: (e: DragEvent) => { if (moving.current && activity.id !== moving.current.activity.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; mark({ activity, position }); } },
      onDrop: (e: DragEvent) => { if (moving.current && activity.id !== moving.current.activity.id) { e.preventDefault(); mark({ activity, position }); finish(); } },
    };
  }
  return { id, destination, cardProps, zoneProps,
    announcement: id ? destination ? `Move ${destination.position} ${destination.activity.title}. Release to drop, or press Enter.` : 'Activity picked up. Drag to a gap, or use arrow keys and Enter. Escape cancels.' : '' };
}
