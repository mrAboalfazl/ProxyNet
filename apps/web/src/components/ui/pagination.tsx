'use client';

import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { toPersianDigits } from '@/lib/jalali';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  lang?: string;
  className?: string;
  showItemCount?: boolean;
  showPageSizeSelector?: boolean;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  lang = 'fa',
  className,
  showItemCount = true,
  showPageSizeSelector = true,
}: PaginationProps) {
  const isFa = lang === 'fa';
  const isRTL = isFa;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  // Compute page number buttons window
  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) {
        pages.push('ellipsis');
      }
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (safeCurrentPage < totalPages - 2) {
        pages.push('ellipsis');
      }
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, safeCurrentPage]);

  // Compute item range
  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  const fmt = (n: number) => (isFa ? toPersianDigits(n) : String(n));

  if (totalItems === 0) {
    return null;
  }

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/70 text-xs text-muted-foreground select-none',
        className
      )}
    >
      {/* Left side: Item count info and page size selector */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
        {showItemCount && (
          <span>
            {isFa ? (
              <>
                نمایش <span className="font-semibold text-foreground">{fmt(startItem)}</span> تا{' '}
                <span className="font-semibold text-foreground">{fmt(endItem)}</span> از{' '}
                <span className="font-semibold text-foreground">{fmt(totalItems)}</span> مورد
              </>
            ) : (
              <>
                Showing <span className="font-semibold text-foreground">{startItem}</span> to{' '}
                <span className="font-semibold text-foreground">{endItem}</span> of{' '}
                <span className="font-semibold text-foreground">{totalItems}</span> items
              </>
            )}
          </span>
        )}

        {showPageSizeSelector && onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline">{isFa ? 'تعداد در صفحه:' : 'Per page:'}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 gap-1.5 text-xs font-normal border-input bg-background hover:bg-accent text-foreground shadow-xs"
                >
                  <span className="font-medium">{fmt(pageSize)}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[5.5rem] p-1">
                {pageSizeOptions.map((opt) => {
                  const isSelected = opt === pageSize;
                  return (
                    <DropdownMenuItem
                      key={opt}
                      onClick={() => onPageSizeChange(opt)}
                      className={cn(
                        'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-sm',
                        isSelected && 'font-semibold bg-accent text-accent-foreground'
                      )}
                    >
                      <span>{fmt(opt)}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Right side: Navigation buttons */}
      <div className="flex items-center gap-1">
        {/* First page */}
        <Button
          variant="outline"
          size="sm"
          disabled={safeCurrentPage <= 1}
          onClick={() => onPageChange(1)}
          className="h-8 w-8 p-0"
          title={isFa ? 'صفحه اول' : 'First page'}
        >
          {isRTL ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>

        {/* Previous page */}
        <Button
          variant="outline"
          size="sm"
          disabled={safeCurrentPage <= 1}
          onClick={() => onPageChange(safeCurrentPage - 1)}
          className="h-8 w-8 p-0"
          title={isFa ? 'صفحه قبل' : 'Previous page'}
        >
          {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (p === 'ellipsis') {
              return (
                <span key={`el-${idx}`} className="px-1 text-muted-foreground">
                  …
                </span>
              );
            }
            const isCurrent = p === safeCurrentPage;
            return (
              <Button
                key={p}
                variant={isCurrent ? 'default' : 'outline'}
                size="sm"
                onClick={() => onPageChange(p)}
                className={cn(
                  'h-8 min-w-[32px] px-2 text-xs font-medium',
                  isCurrent && 'shadow-sm font-bold'
                )}
              >
                {fmt(p)}
              </Button>
            );
          })}
        </div>

        {/* Next page */}
        <Button
          variant="outline"
          size="sm"
          disabled={safeCurrentPage >= totalPages}
          onClick={() => onPageChange(safeCurrentPage + 1)}
          className="h-8 w-8 p-0"
          title={isFa ? 'صفحه بعد' : 'Next page'}
        >
          {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        {/* Last page */}
        <Button
          variant="outline"
          size="sm"
          disabled={safeCurrentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className="h-8 w-8 p-0"
          title={isFa ? 'صفحه آخر' : 'Last page'}
        >
          {isRTL ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

/**
 * Reusable client-side pagination hook
 */
export function usePagination<T>(items: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Reset or constrain page when list changes
  const validPage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, validPage, pageSize]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  return {
    page: validPage,
    setPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    total,
    totalPages,
    paginatedItems,
  };
}
