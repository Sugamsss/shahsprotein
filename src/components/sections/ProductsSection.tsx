import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { HighlightedText } from '../ui/HighlightedText';
import { Modal } from '../ui/Modal';
import { OrderLink } from '../ui/OrderLink';
import { SizeChoice } from '../order/SizeChoice';
import { preloadOrderHandlers } from '../order/OrderButton';
import { LazyOrderPanel } from '../order/orderPanelLoader';
import { productsData } from '../../data/products';
import { siteConfig } from '../../data/siteConfig';
import { useOrder } from '../../context/OrderContext';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { usePrices, useWebsiteOffer } from '../../services/priceService';
import { useSliceAMissing } from '../../services/sliceA';
import { firstInStockSize, useStock } from '../../services/stockService';
import { useTheme } from '../../context/ThemeContext';
import { formatRupees, mrpOf, packPrice } from '../../utils/prices';
import type { Product } from '../../types/product';
import type { WebsiteQuote } from '../../types/offer';
import type { Theme } from '../../types/theme';

/** ["250 g", "500 g"] -> "250 g and 500 g" */
const joinWithAnd = (items: string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] ?? '';

const copy = siteConfig.order;
const text = siteConfig.products;

/** The pack as the current whole-cart quote priced it, so cards never blend candidates. */
const quotePack = (quote: WebsiteQuote | null, product: Product, size: string) =>
  quote?.catalogue.find((pack) => pack.product_id === product.id && pack.size === size) ?? null;

/** The pack sizes that have an MRP, with it, in pack order. */
const pricedSizes = (product: Product, quote: WebsiteQuote | null): Array<[size: string, mrp: number, price: number]> =>
  product.weightOptions.flatMap((size) => {
    const priced = quotePack(quote, product, size);
    if (priced) return [[size, priced.mrp, priced.unit_price] as [string, number, number]];
    // With a quote, a pack it doesn't price is shown at MRP; the guest list never blends in.
    if (quote) {
      const mrp = mrpOf(product, size);
      return mrp == null ? [] : [[size, mrp, mrp] as [string, number, number]];
    }
    const pack = packPrice(product, size);
    return pack == null ? [] : [[size, pack.mrp, pack.price] as [string, number, number]];
  });

/** A price tag per pack: the MRP, with its pack size under it. */
const PackPrices: React.FC<{ product: Product }> = ({ product }) => {
  usePrices();
  const offer = useWebsiteOffer();
  const { quote } = useOrder();
  const sizes = pricedSizes(product, quote);
  if (sizes.length === 0) return null;
  if (!quote && !offer) return <dl className="pack-prices pack-prices--unpriced" aria-label={text.mrpLabel(product.name)}>{product.weightOptions.map((size) => <div key={size} className="pack-prices__item"><dt>{size}</dt><dd>{mrpOf(product, size) != null ? formatRupees(mrpOf(product, size)!) : '—'}</dd></div>)}</dl>;
  return (
    <dl className="pack-prices" aria-label={text.mrpLabel(product.name)}>
      {sizes.map(([size, mrp, price]) => (
        <div key={size} className="pack-prices__item">
          <dt>{size}</dt>
          <dd><del><span className="visually-hidden">MRP </span>{formatRupees(mrp)}</del><span className="pack-prices__now"><span className="visually-hidden">Your price </span>{formatRupees(price)}</span></dd>
        </div>
      ))}
    </dl>
  );
};

const ProductCard: React.FC<{
  product: Product;
  theme: Theme;
  /** Every pack size is out: "Back soon" instead of Add. */
  out: boolean;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
}> = ({ product, theme, out, onOpen, onAdd }) => (
  <article className={`portfolio-card portfolio-card--${product.id}`}>
    <img
      className="portfolio-card__art"
      src={theme === 'dark' ? product.imageDark : product.image}
      alt={text.cardImageAlt(product.name)}
      width={946}
      height={728}
      loading="lazy"
      decoding="async"
    />
    <div className="portfolio-card__body">
      <h3>{product.name}</h3>
      <p className="portfolio-card__tagline">{product.tagline}</p>
      <p className="portfolio-card__description">{product.shortDescription}</p>
      <PackPrices product={product} />
      <div className="portfolio-card__actions">
        <button
          type="button"
          className="portfolio-card__action"
          aria-label={text.viewDetailsLabel(product.name)}
          aria-haspopup="dialog"
          onClick={() => onOpen(product)}
        >
          {text.viewDetails} <ArrowUpRight size={18} aria-hidden="true" />
        </button>
        {/* Adds the smallest pack in stock (or one more of it) and opens "Your order". */}
        {out ? (
          <span className="back-soon">{copy.backSoon}</span>
        ) : (
          <button
            type="button"
            aria-haspopup="dialog"
            className="order-btn order-btn--sm portfolio-card__order portfolio-card__add"
            aria-label={copy.cardAddLabel(product.name)}
            onClick={() => onAdd(product)}
            {...preloadOrderHandlers}
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            <span>{copy.cardAdd}</span>
          </button>
        )}
      </div>
    </div>
  </article>
);

/** The product popup's pinned bar: pick a pack size, then add it to the order. */
const ProductOrderBar: React.FC<{ product: Product; onAdd: (size: string) => void }> = ({ product, onAdd }) => {
  const stock = useStock();
  usePrices();
  const offer = useWebsiteOffer();
  const { quote } = useOrder();
  // No Slice A server (its offer RPC answers 404): the old plain MRP, no
  // crossed price and no "your price" line, exactly as the site shipped.
  const legacyPricing = useSliceAMissing();
  const [picked, setSize] = useState<string | undefined>(undefined);
  // The picked size, unless it's out (stock can arrive while the popup is open):
  // then the first size in stock. Undefined when every size is out.
  const size = picked && !stock.isOut(product.id, picked) ? picked : firstInStockSize(product, stock);
  const priced = size ? quotePack(quote, product, size) : null;
  const fallbackPrice = size ? packPrice(product, size) : null;
  const price = priced
    ? { price: priced.unit_price, mrp: priced.mrp }
    : quote
      ? (() => { const mrp = size ? mrpOf(product, size) : undefined; return mrp == null ? null : { price: mrp, mrp }; })()
      : fallbackPrice;
  const priceKnown = Boolean(quote || offer);

  // Every size out: a calm line in place of the switch and the button, never a
  // button itself, with a way to ask in the order chat (counted as an order click
  // from this product's popup, a source site_events already accepts).
  if (!size) {
    return (
      <div className="popup-bar product-detail__order product-detail__order--out">
        <p className="product-detail__back-soon">
          <span role="status">{copy.backSoon}</span>
          <OrderLink source={`product-details:${product.id}`}>{copy.backSoonAsk}</OrderLink>
        </p>
      </div>
    );
  }

  const outSizes = product.weightOptions.filter((option) => stock.isOut(product.id, option));

  return (
    <div className="popup-bar product-detail__order">
      <SizeChoice
        large
        sizes={product.weightOptions}
        value={size}
        onChange={setSize}
        legend={copy.sizeLegendProduct}
        single={copy.singleSize(product.weightOptions[0])}
        isOut={(option) => stock.isOut(product.id, option)}
      />
      <button
        type="button"
        className="order-btn order-btn--lg product-detail__add"
        onClick={() => onAdd(size)}
        {...preloadOrderHandlers}
      >
        <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
        {/* "Add" on phones, where the switch shares the row (see CSS). */}
        <span className="product-detail__add-long">{copy.addToOrder}</span>
        <span className="product-detail__add-short">{copy.addToOrderShort}</span>
        {/* The picked pack's MRP, so the price changes with the switch. */}
        {price && <span className="product-detail__add-price">{legacyPricing || priceKnown ? formatRupees(price.price) : copy.priceToConfirm}</span>}
      </button>
      {price && !legacyPricing && <p className="product-detail__price-line">{priceKnown ? <><del>{formatRupees(price.mrp)}</del> <span><span className="visually-hidden">Your price </span>{formatRupees(price.price)}</span></> : copy.offerError}</p>}
      {outSizes.map((option) => (
        <p key={option} className="product-detail__size-note">{copy.sizeBackSoon(option)}</p>
      ))}
    </div>
  );
};

export const ProductsSection: React.FC = () => {
  const { theme } = useTheme();
  const { session } = useCustomerAuth();
  // The offer's words only when there is an offer: on the old priced path the
  // cards show one plain MRP, and "your price is lower" beside it would be a
  // promise the page is not making.
  const offer = useWebsiteOffer();
  const sectionRef = useScrollReveal<HTMLElement>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { addItem, openOrder, closeOrder, isOpen, openedFrom, quote } = useOrder();
  const stock = useStock();

  // "Add to order" turns this popup into "Your order" in place: the overlay
  // stays, and the title and content change. The shared OrderDialog stays shut
  // for this opener (see OrderDialog).
  const showingOrder = selectedProduct !== null && isOpen && openedFrom === 'product-details';

  const showingOrderRef = useRef(showingOrder);
  showingOrderRef.current = showingOrder;

  const closeDetails = useCallback(() => {
    setSelectedProduct(null);
    if (showingOrderRef.current) closeOrder();
  }, [closeOrder]);

  const addFromCard = useCallback((product: Product) => {
    addItem(product.id);
    openOrder('product');
  }, [addItem, openOrder]);

  const addFromDetails = (product: Product, size: string) => {
    addItem(product.id, size);
    openOrder('product-details');
  };

  return (
    <>
      <section id="products" ref={sectionRef} className="reveal products-section snap-section" aria-label={text.label}>
        <Container>
          <div className="portfolio-intro">
            <p className="portfolio-intro__eyebrow"><Badge>{text.eyebrow}</Badge></p>
            <h2><HighlightedText segments={text.heading} as="em" /></h2>
            <p>{text.intro}</p>
            {offer && <p className="portfolio-intro__price-note">{text.priceHonesty}</p>}
            {/* The chip promises a bigger discount, so it waits for the quote that
                would carry it: the legacy path asks for none, and a login there
                could never change a price. */}
            {quote && !session && <Link className="offer-login-chip" to="/login?return=%2F%23products">{text.loginChip}</Link>}
          </div>
          <div className="portfolio-grid">
            {productsData.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                theme={theme}
                out={stock.isProductOut(product.id)}
                onOpen={setSelectedProduct}
                onAdd={addFromCard}
              />
            ))}
          </div>
        </Container>
      </section>

      {selectedProduct && (
        <Modal
          isOpen
          onClose={closeDetails}
          title={showingOrder ? copy.title : selectedProduct.name}
          titleClassName={showingOrder ? undefined : 'modal-title--product'}
          className={showingOrder ? 'order-dialog' : undefined}
        >
          {showingOrder ? (
            <React.Suspense fallback={null}>
              <LazyOrderPanel switched />
            </React.Suspense>
          ) : (
            <div className="product-detail">
              <p className="product-detail__founder-note">{selectedProduct.benefits}</p>

              <section className="product-detail__section" aria-label={text.ingredients}>
                <h4>{text.ingredients}</h4>
                <ul className="product-detail__chips" role="list">
                  {selectedProduct.ingredients.map((ingredient, index) => {
                    const { image, rows } = selectedProduct.ingredientSprite;
                    const column = index % 3;
                    const row = Math.floor(index / 3);

                    return (
                      <li key={ingredient} className="product-detail__chip">
                        <span
                          className="product-detail__chip-art"
                          aria-hidden="true"
                          style={{
                            backgroundImage: `url(${image})`,
                            backgroundSize: `300% ${rows * 100}%`,
                            backgroundPosition: `${column * 50}% ${(row / (rows - 1)) * 100}%`,
                          }}
                        />
                        <span className="product-detail__chip-name">{ingredient}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="product-detail__section" aria-label={text.goodToKnow}>
                <h4>{text.goodToKnow}</h4>
                <dl className="product-detail__facts">
                  <div>
                    <dt>{text.staysFresh}</dt>
                    <dd>{text.freshness(selectedProduct.shelfLife, selectedProduct.madeToOrder)}</dd>
                  </div>
                  <div>
                    <dt>{text.contains}</dt>
                    <dd>{selectedProduct.contains}</dd>
                  </div>
                  {selectedProduct.weightOptions.length > 0 && (
                    <div>
                      <dt>{text.packSizes(selectedProduct.weightOptions.length)}</dt>
                      <dd>{joinWithAnd(selectedProduct.weightOptions)}</dd>
                    </div>
                  )}

                </dl>
              </section>

              <section className="product-detail__section" aria-label={text.nutrition}>
                <h4>{text.nutrition}</h4>
                {selectedProduct.nutritionFacts.length > 0 ? (
                  <table className="product-detail__nutrition">
                    <thead>
                      <tr>
                        <th scope="col">{text.nutrient}</th>
                        <th scope="col">{text.per100g}</th>
                        <th scope="col">{text.perServing} <span>{text.serving}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.nutritionFacts.map((fact) => (
                        <tr key={fact.label}>
                          <th scope="row" className={fact.isSubItem ? 'product-detail__nutrition-subitem' : undefined}>{fact.label}</th>
                          <td>{fact.per100g}</td>
                          <td>{fact.perServing}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="product-detail__note">
                    {text.nutritionMissing(selectedProduct.name)}{' '}
                    <OrderLink source={`nutrition:${selectedProduct.id}`} ask variant="text">
                      {text.nutritionAsk}
                    </OrderLink>{' '}
                    {text.nutritionAskAfter}
                  </p>
                )}
              </section>

              {/* Pinned to the bottom of the popup, so it never hides below the nutrition table. */}
              <ProductOrderBar
                key={selectedProduct.id}
                product={selectedProduct}
                onAdd={(size) => addFromDetails(selectedProduct, size)}
              />
            </div>
          )}
        </Modal>
      )}
    </>
  );
};
