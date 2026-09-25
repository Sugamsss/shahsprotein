import React from 'react';
import type { TextSegment } from '../../types/content';

/** Renders copy from `src/data/` with its highlighted parts wrapped in `as` (a span by default). */
export const HighlightedText: React.FC<{
  segments: TextSegment[];
  as?: 'span' | 'em';
  className?: string;
}> = ({ segments, as: Tag = 'span', className }) => (
  <>
    {segments.map((segment, index) => (
      segment.highlight ? (
        <Tag key={`${segment.text}-${index}`} className={className}>{segment.text}</Tag>
      ) : segment.text
    ))}
  </>
);
