import { useEffect, useMemo, useState } from 'react';
import { zipSync } from 'fflate';
import { fileUrl, signedUrls } from '../lib/api';
import { useToast } from '../lib/toast';
import { fmtDate, plural } from '../lib/format';

export const fmtSize = (b) => {
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} Go`;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(b / 1024))} Ko`;
};
const MAX_ZIP_MB = 400; // l'archive est assemblée dans la mémoire du navigateur

// Les fichiers d'un même dépôt partagent le dossier <client>/<dépôt>/ dans le stockage.
export const batchOf = (f) => f.storage_path.split('/')[1] || f.id;
export function groupFiles(files) {
  const map = new Map();
  for (const f of files) {
    const k = batchOf(f);
    if (!map.has(k)) map.set(k, { key: k, lot: f.lot, note: f.note, created_at: f.created_at, files: [] });
    map.get(k).files.push(f);
  }
  return Array.from(map.values());
}
function save(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
const uniqueName = (name, used) => {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 2; ; i++) { const n = `${stem} (${i})${ext}`; if (!used.has(n)) { used.add(n); return n; } }
};
const safe = (s) => (s || 'fichiers').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fichiers';

export default function FilesSection({ files, admin = false, onDelete }) {
  const toast = useToast();
  const [thumbs, setThumbs] = useState({});
  const [zipping, setZipping] = useState('');
  const groups = useMemo(() => groupFiles(files), [files]);

  useEffect(() => {
    let alive = true;
    const paths = files.map((f) => f.thumb_path).filter(Boolean);
    signedUrls('files', paths).then((m) => alive && setThumbs(m)).catch(() => {});
    return () => { alive = false; };
  }, [files]);

  const one = async (f) => {
    try { save(await fileUrl(f.storage_path, f.name), f.name); } catch (e) { toast(e.message); }
  };
  const all = async (g) => {
    const total = g.files.reduce((n, f) => n + f.size_bytes, 0);
    if (total > MAX_ZIP_MB * 1024 * 1024) return toast(`Ce dépôt dépasse ${MAX_ZIP_MB} Mo : téléchargez les fichiers un par un.`);
    if (g.files.length === 1) return one(g.files[0]);
    setZipping(g.key);
    try {
      const used = new Set(), entries = {};
      for (const f of g.files) {
        const res = await fetch(await fileUrl(f.storage_path));
        if (!res.ok) throw new Error(`« ${f.name} » n’a pas pu être récupéré.`);
        entries[uniqueName(f.name, used)] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }]; // déjà compressés : on archive sans recompresser
      }
      const url = URL.createObjectURL(new Blob([zipSync(entries)], { type: 'application/zip' }));
      save(url, `${safe(g.lot)}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast(e.message || 'L’archive n’a pas pu être créée.'); }
    setZipping('');
  };
  const del = (list, label) => {
    if (window.confirm(`Supprimer définitivement ${label} ? Le client ne pourra plus le télécharger.`)) onDelete(list);
  };

  return (
    <div className="files">
      {groups.map((g) => {
        const total = g.files.reduce((n, f) => n + f.size_bytes, 0);
        return (
          <article className="file-lot" key={g.key}>
            <div className="file-lot-head">
              <div>
                <h3>{g.lot || `Dépôt du ${fmtDate(g.created_at)}`}</h3>
                <p className="doc-meta">{plural(g.files.length, 'fichier', 'fichiers')}, {fmtSize(total)}, ajouté le {fmtDate(g.created_at)}</p>
                {g.note && <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{g.note}</p>}
              </div>
              <div className="doc-actions">
                <button className="btn btn-primary btn-sm" onClick={() => all(g)} disabled={Boolean(zipping)}>
                  {zipping === g.key ? 'Préparation…' : g.files.length > 1 ? 'Tout télécharger (.zip)' : 'Télécharger'}
                </button>
                {admin && <button className="btn btn-ghost btn-sm" onClick={() => del(g.files, g.files.length > 1 ? 'ce dépôt' : 'ce fichier')}>Supprimer</button>}
              </div>
            </div>
            <ul className="file-grid">
              {g.files.map((f) => (
                <li className="file-card" key={f.id}>
                  <div className="file-thumb">
                    {f.thumb_path && thumbs[f.thumb_path]
                      ? <img src={thumbs[f.thumb_path]} alt="" loading="lazy" />
                      : <span className="file-ext" aria-hidden="true">{(f.name.split('.').pop() || 'fichier').slice(0, 5).toUpperCase()}</span>}
                  </div>
                  <p className="file-name" title={f.name}>{f.name}</p>
                  <p className="doc-meta">{fmtSize(f.size_bytes)}</p>
                  <div className="doc-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => one(f)} aria-label={`Télécharger ${f.name}`}>Télécharger</button>
                    {admin && g.files.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => del([f], `« ${f.name} »`)} aria-label={`Supprimer ${f.name}`}>Retirer</button>}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
