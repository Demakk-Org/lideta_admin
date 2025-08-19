"use client";

import React from "react";

export enum AppButtonVariant {
  Add = "add",
  Edit = "edit",
  Delete = "delete",
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: AppButtonVariant;
};

function classesForVariant(variant: AppButtonVariant) {
  // Strong contrast defaults; tuned to project's primary palette in tailwind.config.js
  switch (variant) {
    case AppButtonVariant.Add:
      return "bg-gray-900 border border-black text-white hover:bg-black focus-visible:ring-white/80";
    case AppButtonVariant.Edit:
      return "bg-white border border-gray-900 text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-300";
    case AppButtonVariant.Delete:
      return "bg-red-600 border border-red-600 text-white hover:bg-red-700 focus-visible:ring-red-200";
    default:
      return "bg-gray-900 border border-black text-white hover:bg-black focus-visible:ring-white/80";
  }
}

export default function AppButton({ variant, className = "", disabled, children, ...rest }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold shadow focus:outline-none focus-visible:ring-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed";
  const variantClasses = classesForVariant(variant);
  return (
    <button disabled={disabled} className={`${base} ${variantClasses} ${className}`} {...rest}>
      {children}
    </button>
  );
}
