import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import type { Product } from '../../types/product';

/** A product's square thumbnail. Decorative: its name always sits right next to it. */
export const OrderThumb: React.FC<{ product: Product; className: string }> = ({ product, className }) => {
  const { theme } = useTheme();
  return (
    <span className={`order-thumb order-thumb--${product.id} ${className}`} aria-hidden="true">
      <img
        src={theme === 'dark' ? product.orderThumbDark : product.orderThumb}
        width={192}
        height={192}
        loading="lazy"
        decoding="async"
        alt=""
      />
    </span>
  );
};
