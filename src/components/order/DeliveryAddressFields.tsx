import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useOrder } from '../../context/OrderContext';
import { siteConfig } from '../../data/siteConfig';
import { loadPlaces, searchPlaces, selectedAddress } from '../../services/placesAddress';

const copy = siteConfig.order;
// Suggestions need a browser key; without one the address is simply typed in.
const placesConfigured = (): boolean => Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
type Key = 'premises' | 'area' | 'city' | 'state' | 'pincode' | 'landmark';
export const DeliveryAddressFields: React.FC<{ submitted?: boolean }> = ({ submitted = false }) => {
  const { address, setAddress, editAddressPart } = useOrder();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<{ label: string; place: any }[]>([]);
  const [active, setActive] = useState(-1);
  const [failed, setFailed] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const version = useRef(0);
  const addressRef = useRef(address);
  addressRef.current = address;
  const token = useRef<any>(null);
  const timer = useRef<number | undefined>(undefined);
  const [touched, setTouched] = useState<Partial<Record<Key, boolean>>>({});
  useEffect(() => () => { ++version.current; window.clearTimeout(timer.current); }, []);
  const invalidate = () => { ++version.current; window.clearTimeout(timer.current); setItems([]); setActive(-1); setLoading(false); setNoMatch(false); };
  const search = (value: string) => {
    setQuery(value);
    const current = ++version.current;
    setActive(-1);
    setNoMatch(false);
    window.clearTimeout(timer.current);
    if (value.trim().length < 3) { setItems([]); return; }
    timer.current = window.setTimeout(() => {
      setLoading(true);
      void loadPlaces().then((places) => {
        token.current ??= new places.AutocompleteSessionToken();
        return searchPlaces(value, token.current);
      }).then((results) => { if (current === version.current) { setItems(results); setActive(-1); setNoMatch(!results.length); } })
        .catch(() => { if (current === version.current) setFailed(true); })
        .finally(() => { if (current === version.current) setLoading(false); });
    }, 250);
  };
  const choose = async (index: number) => {
    const item = items[index]; if (!item) return;
    const current = ++version.current;
    setItems([]); setQuery(''); setLoading(true);
    try {
      const parts = await selectedAddress(item.place);
      if (current !== version.current) return;
      const latest = { ...addressRef.current };
      (['premises', 'area', 'city', 'state', 'pincode'] as const).forEach((key) => {
        if (!latest[key] && parts[key]) latest[key] = parts[key]!;
      });
      addressRef.current = latest;
      setAddress(latest);
      token.current = null;
    } catch { if (current === version.current) setFailed(true); }
    finally { if (current === version.current) setLoading(false); }
  };
  const field = (key: Key, label: string, autocomplete: string, maxLength: number, required = true) => {
    const value = (address[key] ?? '').trim();
    const invalid = required && (key === 'pincode' ? !/^[1-9]\d{5}$/.test(value) : !value) && (submitted || touched[key]);
    const error = invalid ? key === 'pincode' ? (value ? copy.pincodeInvalid : copy.pincodeMissing) : copy.addressFieldMissing(label) : '';
    return (
    <div className="order-field" key={key}>
      <label className="order-field__label" htmlFor={`delivery-${key}`}>{label}</label>
      <input id={`delivery-${key}`} name={autocomplete === 'off' ? key : autocomplete} className="input" value={address[key] ?? ''} maxLength={maxLength}
        autoComplete={autocomplete} required={required} aria-invalid={invalid || undefined} aria-describedby={error ? `delivery-${key}-error` : undefined}
        onBlur={() => setTouched((old) => ({ ...old, [key]: true }))} onChange={(event) => { invalidate(); addressRef.current = { ...addressRef.current, [key]: event.target.value }; editAddressPart(key, event.target.value); }} />
      {error && <p id={`delivery-${key}-error`} className="order-field__error">{error}</p>}
    </div>
    );
  };
  return <fieldset className="delivery-fields">
    <legend>{copy.addressLegend}</legend>
    {!placesConfigured() ? null : failed ? <p className="order-field__hint">{copy.addressSearchDown}</p> : <div className="order-field delivery-search">
      <label className="order-field__label" htmlFor="delivery-search">{copy.addressSearchLabel}</label>
      <div className="delivery-search__input"><Search size={18} aria-hidden="true" />
        <input id="delivery-search" className="input" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={items.length > 0}
          aria-controls="delivery-suggestions" aria-activedescendant={active >= 0 && active < items.length ? `delivery-option-${active}` : undefined}
          value={query} placeholder={copy.addressSearchHint} onChange={(event) => search(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && items.length) { event.preventDefault(); setActive((active + 1) % items.length); }
            if (event.key === 'ArrowUp' && items.length) { event.preventDefault(); setActive((active - 1 + items.length) % items.length); }
            // Open suggestions take Escape; otherwise it closes the popup as usual.
            if (event.key === 'Escape' && items.length) { event.preventDefault(); event.stopPropagation(); setItems([]); setActive(-1); ++version.current; }
            if (event.key === 'Enter' && active >= 0) { event.preventDefault(); void choose(active); }
          }} />
        {loading && <span className="visually-hidden" role="status">{copy.addressSearching}</span>}
      </div>
      <p className="order-field__hint">{noMatch ? copy.addressNoMatch : copy.addressSearchHint}</p>
      {items.length > 0 && <ul id="delivery-suggestions" role="listbox" className="delivery-suggestions">
        {items.map((item, index) => <li key={`${index}-${item.label}`} id={`delivery-option-${index}`} role="option" aria-selected={index === active}>
          <button type="button" onClick={() => void choose(index)}>{item.label}</button>
        </li>)}<li className="delivery-attribution"><img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt={copy.addressAttribution} /></li>
      </ul>}
    </div>}
    {field('premises', copy.houseLabel, 'address-line1', 160)}
    {field('area', copy.streetLabel, 'address-line2', 160)}
    {field('landmark', copy.landmarkLabel, 'off', 160, false)}
    <div className="delivery-fields__row">{field('city', copy.cityLabel, 'address-level2', 80)}{field('state', copy.stateLabel, 'address-level1', 80)}</div>
    {field('pincode', copy.pincodeLabel, 'postal-code', 6)}
  </fieldset>;
};
