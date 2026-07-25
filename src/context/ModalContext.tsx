import React, { createContext, useContext, useState } from 'react';
import { Product } from '../types/product';

interface ModalContextType {
  selectedProduct: Product | null;
  openProductModal: (product: Product) => void;
  closeProductModal: () => void;
  isWaitlistModalOpen: boolean;
  openWaitlistModal: () => void;
  closeWaitlistModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);

  const openProductModal = (product: Product) => setSelectedProduct(product);
  const closeProductModal = () => setSelectedProduct(null);

  const openWaitlistModal = () => setIsWaitlistModalOpen(true);
  const closeWaitlistModal = () => setIsWaitlistModalOpen(false);

  return (
    <ModalContext.Provider
      value={{
        selectedProduct,
        openProductModal,
        closeProductModal,
        isWaitlistModalOpen,
        openWaitlistModal,
        closeWaitlistModal,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
