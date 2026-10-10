import React from 'react';
import { adminCopy } from '../../data/adminCopy';
import { getKitchenHistory } from '../api';
import { useRpc } from '../useRpc';
import { HistoryRow } from './HistoryRow';

const copy = adminCopy.kitchen.history;

/**
 * "History" in Fix a batch: this batch's own lines, newest first. Nothing shows while
 * it loads, or when it fails or isn't set up yet (the migration is still to come).
 */
export const BatchHistory: React.FC<{ batchId: string }> = ({ batchId }) => {
  const list = useRpc(() => getKitchenHistory({ batchId, limit: 20 }), [batchId]);
  const entries = list.error ? [] : (list.data?.entries ?? []);
  if (!entries.length) return null;
  return (
    <section className="adm-kx-history" aria-labelledby="adm-kx-history-title">
      <h3 id="adm-kx-history-title" className="adm-kx-label">{copy.batchTitle}</h3>
      <ul className="adm-card adm-list">
        {entries.map((entry) => <HistoryRow key={entry.id} entry={entry} />)}
      </ul>
    </section>
  );
};
