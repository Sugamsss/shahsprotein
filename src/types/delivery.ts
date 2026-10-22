/** Customer-provided delivery details; never persist outside an order submission. */
export interface DeliveryAddress {
  premises: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
}
