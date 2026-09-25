import { z } from "zod";

// Accept the common local and international notations, then store E.164.
export const bangladeshPhone = z.string().trim().transform((value) => {
  const compact = value.replace(/[\s()\-]/g, "");
  if (compact.startsWith("+880")) return compact;
  if (compact.startsWith("880")) return `+${compact}`;
  if (compact.startsWith("0")) return `+88${compact}`;
  return compact;
}).refine((value) => /^[+]8801[3-9][0-9]{8}$/.test(value), {
  message: "Enter a Bangladesh mobile number, for example 01712345678"
});
