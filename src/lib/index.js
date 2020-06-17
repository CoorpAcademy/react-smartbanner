import React from 'react'
import PropTypes from 'prop-types'
import ua from 'ua-parser-js'
import cookie from 'cookie-cutter'
import classnames from 'classnames'

import styles from './styles.module.css'

const isClient = typeof window !== 'undefined'
const expiredDateInUTC = (additionalDays) => {
  const expiredDate = new Date()

  expiredDate.setDate(expiredDate.getDate() + additionalDays)

  return expiredDate.toUTCString()
}

class SmartBanner extends React.Component {
  state = {
    type: '',
    appId: '',
    settings: {}
  }

  UNSAFE_componentWillMount() {
    this.setType(this.props.force)
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (nextProps.force !== this.props.force) {
      this.setType(nextProps.force)
    }
    if (nextProps.position === 'top') {
      window.document
        .querySelector('html')
        .classList.add(styles.smartbannerMarginTop)
      window.document
        .querySelector('html')
        .classList.remove(styles.smartbannerMarginBottom)
    } else if (nextProps.position === 'bottom') {
      window.document
        .querySelector('html')
        .classList.add(styles.smartbannerMarginBottom)
      window.document
        .querySelector('html')
        .classList.remove(styles.smartbannerMarginTop)
    }
  }

  componentWillUnmount() {
    const documentRoot = window.document.querySelector('html')

    documentRoot.classList.remove(styles.smartbannerShow)
    documentRoot.classList.remove(styles.smartbannerMarginTop)
    documentRoot.classList.remove(styles.smartbannerMarginBottom)
  }

  setType(deviceType) {
    let type

    if (isClient) {
      const agent = ua(window.navigator.userAgent)

      if (deviceType) {
        // force set case
        type = deviceType
      } else if (
        agent.os.name === 'Windows Phone' ||
        agent.os.name === 'Windows Mobile'
      ) {
        type = 'windows'
        // iOS >= 6 has native support for Smart Banner
      } else if (
        agent.os.name === 'iOS' &&
        (this.props.ignoreIosVersion ||
          parseInt(agent.os.version, 10) < 6 ||
          agent.browser.name !== 'Mobile Safari')
      ) {
        type = 'ios'
      } else if (
        agent.device.vender === 'Amazon' ||
        agent.browser.name === 'Silk'
      ) {
        type = 'kindle'
      } else if (agent.os.name === 'Android') {
        type = 'android'
      }
    }

    this.setState(
      {
        type
      },
      () => {
        if (type) {
          this.setSettingsByType()
        }
      }
    )
  }

  setSettingsByType() {
    const mixins = {
      ios: {
        appMeta: () => this.props.appMeta.ios,
        iconRels: ['apple-touch-icon-precomposed', 'apple-touch-icon'],
        getStoreLink: () =>
          `https://itunes.apple.com/${this.props.appStoreLanguage}/app/id`
      },
      android: {
        appMeta: () => this.props.appMeta.android,
        iconRels: [
          'android-touch-icon',
          'apple-touch-icon-precomposed',
          'apple-touch-icon'
        ],
        getStoreLink: () => 'http://play.google.com/store/apps/details?id='
      },
      windows: {
        appMeta: () => this.props.appMeta.windows,
        iconRels: [
          'windows-touch-icon',
          'apple-touch-icon-precomposed',
          'apple-touch-icon'
        ],
        getStoreLink: () => 'http://www.windowsphone.com/s?appid='
      },
      kindle: {
        appMeta: () => this.props.appMeta.kindle,
        iconRels: [
          'windows-touch-icon',
          'apple-touch-icon-precomposed',
          'apple-touch-icon'
        ],
        getStoreLink: () => 'amzn://apps/android?asin='
      }
    }

    this.setState(
      (prevState) => ({
        settings: mixins[prevState.type]
      }),
      () => {
        if (this.state.type) {
          this.parseAppId()
        }
      }
    )
  }

  hide = () => {
    if (isClient) {
      window.document
        .querySelector('html')
        .classList.remove(styles.smartbannerShow)
    }
  }

  show = () => {
    if (isClient) {
      window.document
        .querySelector('html')
        .classList.add(styles.smartbannerShow)
    }
  }

  close = () => {
    this.hide()
    cookie.set('smartbanner-closed', 'true', {
      path: '/',
      expires: expiredDateInUTC(this.props.daysHidden)
    })

    if (this.props.onClose && typeof this.props.onClose === 'function') {
      this.props.onClose()
    }
  }

  install = () => {
    this.hide()
    cookie.set('smartbanner-installed', 'true', {
      path: '/',
      expires: expiredDateInUTC(this.props.daysReminder)
    })

    if (this.props.onInstall && typeof this.props.onInstall === 'function') {
      this.props.onInstall()
    }
  }

  parseAppId() {
    if (!isClient) {
      return ''
    }

    const meta = window.document.querySelector(
      `meta[name="${this.state.settings.appMeta()}"]`
    )

    if (!meta) {
      return ''
    }

    let appId = ''

    if (this.state.type === 'windows') {
      appId = meta.getAttribute('content')
    } else {
      const content = /app-id=([^\s,]+)/.exec(meta.getAttribute('content'))

      appId = content && content[1] ? content[1] : appId
    }

    this.setState({
      appId
    })

    return appId
  }

  retrieveInfo() {
    const link =
      `${this.props.url[this.state.type]}` ||
      this.state.settings.getStoreLink() + this.state.appId
    const inStore = `
      ${this.props.price[this.state.type]} - ${
      this.props.storeText[this.state.type]
    }`

    let icon

    if (isClient) {
      const rel = window.document.querySelector(
        `link[rel="${this.props.iconRel}"]`
      )

      if (rel) {
        icon = rel.getAttribute('href')
      }
    }

    return {
      icon,
      link,
      inStore
    }
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.substr(1, str.length)
  }

  render() {
    const { type, appId } = this.state

    if (!isClient || !this.props.visible) {
      return <div />
    }

    // Don't show banner when:
    // 1) if device isn't iOS or Android
    // 2) website is loaded in app,
    // 3) user dismissed banner,
    // 4) or we have no app id in meta
    if (
      !type ||
      window.navigator.standalone ||
      cookie.get('smartbanner-closed') ||
      cookie.get('smartbanner-installed')
    ) {
      return <div />
    }

    if (!appId) {
      return <div />
    }

    this.show()

    const { icon, link, inStore } = this.retrieveInfo()
    const smarBannerStylePosition =
      styles['smartbanner' + this.capitalizeFirst(this.props.position)]
    const iconStyle = {
      backgroundImage: `url(${icon})`
    }

    return (
      <div className={classnames(styles.smartbanner, smarBannerStylePosition)}>
        <div className={styles.smartbannerContainer}>
          <button
            type='button'
            className={styles.smartbannerClose}
            aria-label='close'
            onClick={this.close}
          >
            &times;
          </button>
          <span className={styles.smartbannerIcon} style={iconStyle} />
          <div className={styles.smartbannerInfo}>
            <div className={styles.smartbannerTitle}>{this.props.title}</div>
            {(!!this.props.author && (
              <div className={styles.smartbannerAuthor}>
                {this.props.author}
              </div>
            )) || <div className={styles.space} />}
            <div className={styles.smartbannerDescription}>{inStore}</div>
          </div>
          <div className={styles.smartbannerWrapper}>
            <a
              href={link}
              onClick={this.install}
              className={styles.smartbannerButton}
            >
              <span className={styles.smartbannerButtonText}>
                {this.props.button}
              </span>
            </a>
          </div>
        </div>
      </div>
    )
  }
}

SmartBanner.propTypes = {
  daysHidden: PropTypes.number,
  daysReminder: PropTypes.number,
  appStoreLanguage: PropTypes.string,
  button: PropTypes.node,
  storeText: PropTypes.objectOf(PropTypes.string),
  price: PropTypes.objectOf(PropTypes.string),
  force: PropTypes.string,
  title: PropTypes.string,
  author: PropTypes.string,
  position: PropTypes.string,
  url: PropTypes.objectOf(PropTypes.string),
  ignoreIosVersion: PropTypes.bool,
  iconRel: PropTypes.string,
  appMeta: PropTypes.shape({
    android: PropTypes.string,
    ios: PropTypes.string,
    windows: PropTypes.string,
    kindle: PropTypes.string
  }),
  onClose: PropTypes.func,
  onInstall: PropTypes.func
}

SmartBanner.defaultProps = {
  daysHidden: 15,
  daysReminder: 90,
  appStoreLanguage: isClient
    ? (window.navigator.language || window.navigator.userLanguage).slice(-2) ||
      'us'
    : 'us',
  button: 'View',
  storeText: {
    ios: 'On the App Store',
    android: 'In Google Play',
    windows: 'In Windows Store',
    kindle: 'In the Amazon Appstore'
  },
  price: {
    ios: 'Free',
    android: 'Free',
    windows: 'Free',
    kindle: 'Free'
  },
  force: '',
  title: '',
  author: '',
  position: 'top',
  url: {
    ios: '',
    android: '',
    windows: '',
    kindle: ''
  },
  appMeta: {
    ios: 'apple-itunes-app',
    android: 'google-play-app',
    windows: 'msApplication-ID',
    kindle: 'kindle-fire-app'
  }
}

export { SmartBanner }
