import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import type { Product } from '../../types/product';

/**
 * A product's picture in the order popup. Decorative: its name always sits right next to it.
 * By default it's the square thumbnail. With `tileSizes` it's the 4:5 pouch shot, and the
 * browser picks a width from `tileSizes`, the `sizes` for the slot it fills.
 */
export const OrderThumb: React.FC<{ product: Product; className: string; tileSizes?: string }> = ({
  product,
  className,
  tileSizes,
}) => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const tile = dark ? product.orderTileDark : product.orderTile;
  return (
    <span className={`order-thumb order-thumb--${product.id} ${className}`} aria-hidden="true">
      {tileSizes ? (
        <img
          src={tile.src}
          srcSet={tile.srcSet}
          sizes={tileSizes}
          width={360}
          height={450}
          loading="lazy"
          decoding="async"
          alt=""
        />
      ) : (
        <img
          src={dark ? product.orderThumbDark : product.orderThumb}
          width={192}
          height={192}
          loading="lazy"
          decoding="async"
          alt=""
        />
      )}
    </span>
  );
};
