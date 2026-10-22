import type { DeliveryAddress } from '../types/delivery';

declare global {
  interface Window { google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } } }
}

let loading: Promise<any> | null = null;
/** Load Places only after deliberate search interaction; missing key is manual-only mode. */
export const loadPlaces = (): Promise<any> => {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('Places not configured'));
  if (window.google?.maps?.importLibrary) return window.google.maps.importLibrary('places');
  if (!loading) loading = new Promise<any>((resolve, reject) => {
    const script = document.createElement('script');
    const callback = `__shahsPlacesReady_${Math.random().toString(36).slice(2)}`;
    let timeout = window.setTimeout(() => { cleanup(); reject(new Error('Places load timed out')); }, 12000);
    const cleanup = () => { window.clearTimeout(timeout); delete (window as any)[callback]; };
    (window as any)[callback] = () => {
      cleanup();
      if (window.google?.maps?.importLibrary) resolve(window.google.maps.importLibrary('places'));
      else reject(new Error('Places library unavailable'));
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => { cleanup(); reject(new Error('Places unavailable')); };
    document.head.appendChild(script);
  }).catch((error) => { loading = null; throw error; });
  return loading;
};

export interface AddressSuggestion { label: string; place: any }
export const searchPlaces = async (query: string, token: any): Promise<AddressSuggestion[]> => {
  const places = await loadPlaces();
  const { suggestions = [] } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query, sessionToken: token, includedRegionCodes: ['in'],
  });
  return suggestions.map((item: any) => ({ label: item.placePrediction.text.toString(), place: item.placePrediction.toPlace() }));
};

export const selectedAddress = async (place: any): Promise<Partial<DeliveryAddress>> => {
  await place.fetchFields({ fields: ['addressComponents'] });
  const components = place.addressComponents ?? [];
  const get = (...types: string[]) => components.find((item: any) => types.some((type) => item.types.includes(type)))?.longText ?? '';
  return {
    area: get('route', 'sublocality_level_1', 'sublocality', 'neighborhood'),
    city: get('locality', 'postal_town', 'administrative_area_level_2'),
    state: get('administrative_area_level_1'),
    pincode: get('postal_code'),
  };
};
