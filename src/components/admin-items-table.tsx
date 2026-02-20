"use client";

import { Button } from "komiss/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "komiss/components/ui/table";
import { useState } from "react";

type Item = {
  id: string;
  title: string | null;
  price: number | null;
  status: string | null;
  created_at: string;
};

type Props = {
  items: Item[];
  onDelete: (id: string) => void | Promise<void>;
};

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
  }).format(price);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminItemsTable({ items, onDelete }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Название</TableHead>
          <TableHead>Цена</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead>Дата создания</TableHead>
          <TableHead className="w-[100px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.title ?? "—"}</TableCell>
            <TableCell>{formatPrice(item.price)}</TableCell>
            <TableCell>{item.status ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(item.created_at)}
            </TableCell>
            <TableCell>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
              >
                {deletingId === item.id ? "..." : "Удалить"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
