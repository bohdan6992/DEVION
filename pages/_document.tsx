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
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
