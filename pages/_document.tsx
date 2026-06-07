// pages/_document.tsx
import Document, { Html, Head, Main, NextScript, DocumentContext } from "next/document";
import { parse } from "cookie";

type Props = { initialTheme: string };

export default class MyDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);
    const cookieStr = ctx.req?.headers?.cookie ?? "";
    const cookies = cookieStr ? parse(cookieStr) : {};
    const theme = (cookies["tt-theme"] || "light").toLowerCase();

    return { ...initialProps, initialTheme: theme };
  }

  render() {
    const theme = (this.props as any).initialTheme || "light";
    // вважаємо все, що не "light", темним (як у тебе теми Candy, Cyber, Midnight тощо)
    const isDark =
      theme !== "light" && theme !== "pastel" && theme !== "monochrome";

    return (
      <Html lang="uk" className={isDark ? "dark" : undefined} data-theme={theme}>
        <Head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@500;600;700&family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
