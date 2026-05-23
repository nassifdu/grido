export type Size = "PP" | "P" | "M" | "G" | "GG" | "XGG";

export interface StockRow {
  id: string;
  referencia: string;
  descricao: string;
  cor: string;
  categoria: string;
  estoque: Record<Size, number>;
}

export const SIZES: Size[] = ["PP", "P", "M", "G", "GG", "XGG"];
