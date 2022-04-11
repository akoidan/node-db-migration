import {
  Logger,
  Param
} from './interfaces';

export class ColoredLogger implements Logger {
  colors: {[id: string]: string} = {
    Reset: '\x1b[0m',
    Bright: '\x1b[1m',
    Dim: '\x1b[2m',
    Underscore: '\x1b[4m',
    Blink: '\x1b[5m',
    Reverse: '\x1b[7m',
    Hidden: '\x1b[8m',

    FgBlack: '\x1b[30m',
    FgRed: '\x1b[31m',
    FgGreen: '\x1b[32m',
    FgYellow: '\x1b[33m',
    FgBlue: '\x1b[34m',
    FgMagenta: '\x1b[35m',
    FgCyan: '\x1b[36m',
    FgWhite: '\x1b[37m',

    BgBlack: '\x1b[40m',
    BgRed: '\x1b[41m',
    BgGreen: '\x1b[42m',
    BgYellow: '\x1b[43m',
    BgBlue: '\x1b[44m',
    BgMagenta: '\x1b[45m',
    BgCyan: '\x1b[46m',
    BgWhite: '\x1b[47m'
  };

  success(text: string): void {
    this.infoParamsColor(`{}`, {color: this.colors.FgGreen, param: text});
  }

  info(text: string): void {
    console.log(text);
  }

  infoParams(text: string, ...params: string[]): void {
    const map: Param[] = params.map(e => ({
      color: this.colors.FgCyan,
      param: e
    }));
    this.infoParamsColor(text, ...map);
  }

  infoParamsColor(text: string, ...params: Param[]): void {
    let i = 0;
    text = text.replace("{}", (substring: string, ...args: unknown[]): string => {
      const param = params[i++];
      return `${param.color}${param.param}${this.colors.Reset}`;

    });
    this.info(text);
  }

}
