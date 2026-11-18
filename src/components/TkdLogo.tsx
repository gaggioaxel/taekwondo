import React from 'react';

// Icona stilizzata: figura nera in calcio laterale con onda azzurra (public/logo.svg)
export const TkdLogo: React.FC<{ className?: string }> = ({ className }) => (
  <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TKD Challenge" className={className} draggable={false} />
);
