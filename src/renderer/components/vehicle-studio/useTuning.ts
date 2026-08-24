// Shared tuning state for every category + the Handling editor, so they all
// behave identically: staged edits over the saved file, original (imported)
// values for reset + before/after, undo/redo of edits, and Save/Undo-save.
//
// Model: the file on disk is the "current/saved" state. Edits are staged locally
// and written on Save (surgical, backed up). "Original" is the imported baseline
// (from the service's .vehicle-studio-original snapshot), so Reset always means
// "back to the value you imported", never "GTA default".
import { useState, useCallback, useEffect, useRef } from 'react';

export interface TuningApi {
  loading: boolean;
  readError: string | null;
  saving: boolean;
  fields: VSHandlingField[];
  present: (name: string) => boolean;
  current: Record<string, string>;   // saved file values (flat: 'name' or 'name.x')
  original: Record<string, string>;   // imported baseline (flat)
  val: (key: string) => string;       // edited-or-saved value
  setEdit: (key: string, v: string) => void;
  isDirty: (key: string) => boolean;              // differs from saved
  isModified: (key: string) => boolean;           // differs from original imported
  dirtyKeys: string[];
  resetToOriginal: (key: string) => void;         // stage the imported value
  resetKeysToOriginal: (keys: string[]) => void;
  canUndo: boolean; canRedo: boolean;
  undoEdit: () => void; redoEdit: () => void;
  discardEdits: () => void;
  save: () => Promise<{ ok: boolean; applied?: number; error?: string }>;
  undoLastSave: () => Promise<{ ok: boolean; error?: string }>;
  reload: () => Promise<void>;
}

const flatFromFields = (fields: VSHandlingField[]): Record<string, string> => {
  const o: Record<string, string> = {};
  for (const f of fields) {
    if (f.kind === 'vector') { o[`${f.name}.x`] = f.x ?? ''; o[`${f.name}.y`] = f.y ?? ''; o[`${f.name}.z`] = f.z ?? ''; }
    else if (f.value !== undefined) o[f.name] = f.value;
  }
  return o;
};

export function useTuning(root: string, handlingId: string): TuningApi {
  const [fields, setFields] = useState<VSHandlingField[]>([]);
  const [current, setCurrent] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const past = useRef<Record<string, string>[]>([]);
  const future = useRef<Record<string, string>[]>([]);
  const [, forceHistory] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await window.electronAPI.vehicleStudio.readHandling(root, handlingId);
    setLoading(false);
    if (!r.ok || !r.fields) { setReadError(r.error || 'Could not read handling'); return; }
    setReadError(null);
    setFields(r.fields);
    setCurrent(flatFromFields(r.fields));
    setOriginal(r.original || flatFromFields(r.fields));
    setEdits({}); past.current = []; future.current = []; forceHistory((n) => n + 1);
  }, [root, handlingId]);

  useEffect(() => { reload(); }, [reload]);

  const pushHistory = (next: Record<string, string>) => {
    past.current.push(edits); future.current = []; setEdits(next); forceHistory((n) => n + 1);
  };
  const setEdit = useCallback((key: string, v: string) => { pushHistory({ ...edits, [key]: v }); }, [edits]);
  const resetToOriginal = useCallback((key: string) => { if (key in original) pushHistory({ ...edits, [key]: original[key] }); }, [edits, original]);
  const resetKeysToOriginal = useCallback((keys: string[]) => {
    const next = { ...edits }; for (const k of keys) if (k in original) next[k] = original[k]; pushHistory(next);
  }, [edits, original]);
  const discardEdits = useCallback(() => { pushHistory({}); }, [edits]);

  const undoEdit = useCallback(() => {
    if (!past.current.length) return; future.current.push(edits); setEdits(past.current.pop()!); forceHistory((n) => n + 1);
  }, [edits]);
  const redoEdit = useCallback(() => {
    if (!future.current.length) return; past.current.push(edits); setEdits(future.current.pop()!); forceHistory((n) => n + 1);
  }, [edits]);

  const val = useCallback((key: string) => (key in edits ? edits[key] : current[key]) ?? '', [edits, current]);
  const isDirty = useCallback((key: string) => (key in edits) && edits[key] !== current[key], [edits, current]);
  const isModified = useCallback((key: string) => {
    const v = (key in edits ? edits[key] : current[key]) ?? '';
    return key in original ? parseFloat(v).toFixed(6) !== parseFloat(original[key]).toFixed(6) : false;
  }, [edits, current, original]);
  const dirtyKeys = Object.keys(edits).filter((k) => edits[k] !== current[k]);
  const present = useCallback((name: string) => fields.some((f) => f.name === name), [fields]);

  const save = useCallback(async () => {
    if (!dirtyKeys.length) return { ok: true, applied: 0 };
    setSaving(true);
    const changes = dirtyKeys.map((k) => {
      const [name, axis] = k.split('.');
      return axis ? { name, axis: axis as 'x' | 'y' | 'z', value: edits[k] } : { name, value: edits[k] };
    });
    const r = await window.electronAPI.vehicleStudio.writeHandling(root, handlingId, changes);
    setSaving(false);
    if (r.ok) await reload();
    return r;
  }, [dirtyKeys, edits, root, handlingId, reload]);

  const undoLastSave = useCallback(async () => {
    const r = await window.electronAPI.vehicleStudio.undoHandling(root, handlingId);
    if (r.ok) await reload();
    return r;
  }, [root, handlingId, reload]);

  return {
    loading, readError, saving, fields, present, current, original,
    val, setEdit, isDirty, isModified, dirtyKeys, resetToOriginal, resetKeysToOriginal,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0, undoEdit, redoEdit, discardEdits,
    save, undoLastSave, reload,
  };
}
