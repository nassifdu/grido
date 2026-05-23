import { NextRequest, NextResponse } from "next/server";

const LIMITE = 100;

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("bling_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allProducts = [];
  let pagina = 1;

  while (true) {
    const res = await fetch(
      `https://www.bling.com.br/Api/v3/produtos?limite=${LIMITE}&pagina=${pagina}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: "Bling API error", status: res.status, detail },
        { status: res.status }
      );
    }

    const { data } = await res.json();
    const items = Array.isArray(data) ? data : [];

    allProducts.push(...items);

    if (items.length < LIMITE) break;
    pagina++;
  }

  return NextResponse.json({ total: allProducts.length, products: allProducts });
}
