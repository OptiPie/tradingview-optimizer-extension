<p align="left">
  <a href="https://optipie.app">
      <img src="images/optipie_app_logo_lshift2.png" alt="OptiPie" title="OptiPie" align="left"  />
  </a>
  <h1>TradingView Optimizer Extension   </h1>
</p>

[![OptiPie][optipie-badge]][optipie-url]
[![GNU License][license-badge]][license-url]

OptiPie is a strategy optimizer automation tool for TradingView written in JavaScript. 

Easily optimize strategies, store optimization reports and make analysis via simple UI.

### Download

[![Download][chrome-store-badge]][chrome-store-url]

## 🚀 Quick Start 

<div align="left">
      <a href="https://youtu.be/GLaNRskrIyo">
         <img src="images/ghub-youtube-thumbnail.png" style="width:100%;">
      </a>
</div>

## Features

### Optimize Strategies Up to 4 Parameters :arrow_forward:

Optimize any TradingView Strategy you want up to 4 Parameters.

### Limitless Parameter Input Range :unlock:

Unless your Internet or TradingView is broken, you can optimize with any input range you want.

### Find, Sort, View & Analyze Reports :dart:

Easily find your report in Reports tab with table search and sorts. Open report detail view to make a deep analysis.

### Reports Stored ⚙️

All optimization reports are saved locally using `chrome.storage` API thus can be reached or deleted any time within Reports tab.

### Last Entered Parameter Inputs Stored In State :arrows_counterclockwise:

During your Chrome Session, last entered parameter inputs are stored in a state to make updates easier. 

## FAQ ❓ 

### Is this an official TradingView extension?
No, OptiPie TradingView Optimizer Extension has no affiliation with TradingView. Read more at [Disclaimer](#disclaimer)

### Is it safe to use extension?
There hasn't been any reported account suspension happened yet but always [Use at Your Own Risk Disclaimer](#use-at-your-own-risk-disclaimer)

### Why clicking Optimize button pops up error message on a different page?
Make sure that TradingView tab and Strategy Settings window is opened before starting optimization.

### Why Optimization does not start even though I filled all parameter inputs?
Input 'Start' value always has to be less than 'End' value and for Step Size value use '.'(dot) decimal separator.

### What happens If I interrupt/close Strategy Settings Window or close TradingView tab?
Refresh the page and start optimization again. Do not interfere with any Strategy Settings Window component during optimization process.

### Can I start multiple optimizations in new tabs?
Yes, you can safely start new optimizations in new tabs or safely use your browser as usual.

### How do I know Optimization is done?
Success notification will popup whenever Optimization is completed.

### There are no notifications showing up when Optimization is done or when error occurs?
Please check your system allowed Chrome to send notifications and also check Chrome notification settings allowed 'Tradingview.com' to send notifications.

### There are some missing Strategy Results for some parameters, what should I do?
Sometimes TradingView Strategy Tester Overview window can not be loaded or loaded very slowly due to connection speed or TradingView hence some strategy test results may miss for bigger optimizations. 
If this happens too often, please refresh the page and make sure your internet connection is stable. 


## Application Design Overview

### Dependencies

[Bootstrap](https://getbootstrap.com/), [Bootstrap Table](https://bootstrap-table.com/), [JQuery](https://jquery.com/). 

All the dependencies are placed under `libs` folder. 


### UI

Application UI consists of `popup.html` and `reportdetail.html` files. 

`popup.html` is the main html that user interacts with and also Chrome Manifest requires as default popup. 

`reportdetail.html` is to show detailed optimization report in a new tab and can be only accessed through `popup.html`

### Backend

Application logic starts with `popup.js` which is bounded to `popup.html`. When everything is set, clicking Optimize button calls `chrome.scripting.executeScript` which executes `injector.js` file. This injects application business flow `script.js` file into TradingView.com source and behaves as a middle controller layer between `popup.js` and `script.js`. `background.js` file manages the chrome messages and other kinds of chrome event handlers. Finally, `reportdetail.js` is also bounded to `reportdetail.html` to serve data in UI. 

### Storage 

Every successful optimization report is saved to `chrome.storage.local` with 'report-data-' + 'strategyId' format. 

User Parameter Input values are also stored in `chrome.storage.local` for Chrome Session period. Starting new Chrome session will refresh the values. 

## Contribution ✍️

### Reporting Bugs & Feature/Improvement Suggestions

For any bug, issue reporting and new feature/improvement suggestions, please specify the type in the mail title and send a mail to contact@optipie.app

### Contribute Code 

For bug fixes, please check the [Issues](https://github.com/AtakanPehlivanoglu/tradingview-optimizer-extension/issues) if the bug has already been reported.
For any code contribution, the steps are ;
- Open issue with appropraite label and specify the situation in detail
- If you would like to contribute  code, merge your pull request into your local copy of the project and test the changes. Add the outcome of your testing in a comment on the pull request.  
- Make sure your pull request follows these simple coding style rules; 
  - Project has been developed by a Golang Backend Engineer, number one rule is simplicity. Make things easy to understand, not easy to do. Always code explicitly, not implicitly
  - Do not break the folder structure and architectural flow unless you have a good reason to comment on your pull request
  - Do not use abbreviations on variable and method names, always specify them explicitly and add short comments to your methods
  - Be consistent with the general project coding style and with your changes
- Open your pull request

## Donate ☕

Coffee is the best friend of the developer! [Buy me a coffee](https://www.buymeacoffee.com/matakanpeh4) and let's make the project even better!

## Contact 📞

contact@optipie.app

## Disclaimer

### Trademark Disclaimer

All product and company names are trademarks™ or registered® trademarks of their respective holders. Use of them does not imply any affiliation with or endorsement by them.

Any product names, logos, brands, and other trademarks or images featured or referred to within the optipie.app website or within the OptiPie Optimizer Extension are the property of their respective trademark holders. These trademark holders are not affiliated with OptiPie, our products, or our websites. They do not sponsor or endorse OptiPie or any of our products.

TradingView is trademark of their respective owners and are not affiliated, endorsed, connected or sponsored in any way to this website or any of our affiliate sites.

### Use at Your Own Risk Disclaimer

All information in the Service is provided "as is", with no guarantee of completeness, accuracy, timeliness or of the results obtained from the use of this information, and without warranty of any kind, express or implied, including, but not limited to warranties of performance, merchantability and fitness for a particular purpose.

The Company will not be liable to You or anyone else for any decision made or action taken in reliance on the information given by the Service or for any consequential, special or similar damages, even if advised of the possibility of such damages.

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[license-badge]: https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square
[license-url]: https://www.gnu.org/licenses/gpl-3.0.html
[optipie-badge]: https://img.shields.io/badge/OptiPie-Official-brightgreen
[optipie-url]: https://optipie.app
[chrome-store-badge]: https://img.shields.io/chrome-web-store/v/test?label=CHROME%20STORE%20DOWNLOAD&style=for-the-badge&logo=googlechrome
[chrome-store-url]: https://chrome.google.com/webstore/category/extension

