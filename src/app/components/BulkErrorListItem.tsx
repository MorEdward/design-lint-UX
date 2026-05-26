import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion/dist/framer-motion";

function BulkErrorListItem(props) {
  const ref = useRef();
  const [menuState, setMenuState] = useState(false);
  let error = props.error;

  useOnClickOutside(ref, () => hideMenu());

  const showMenu = () => {
    setMenuState(true);
  };

  const hideMenu = () => {
    setMenuState(false);
  };

  function handleIgnoreChange(error) {
    props.handleIgnoreChange(error);
  }

  function handleSelectAll(error) {
    props.handleSelectAll(error);
  }

  function handleSelect(error) {
    props.handleSelect(error);
  }

  function handleIgnoreAll(error) {
    props.handleIgnoreAll(error);
  }

  function handleBorderRadiusUpdate(value) {
    props.handleBorderRadiusUpdate(value);
  }

  function truncate(string) {
    return string.length > 46 ? string.substring(0, 46) + "..." : string;
  }

  const variants = {
    initial: { opacity: 0, y: -12, scale: 1 },
    enter: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 12, scale: 1 }
  };

  return (
    <motion.li
      className="error-list-item"
      positionTransition
      key={error.node.id + props.index}
      variants={variants}
      initial="initial"
      animate="enter"
      exit="exit"
      type={error.type.toLowerCase()}
    >
      <div className="flex-row" ref={ref} onClick={showMenu}>
        <span
          className={`error-type error-background-${error.type.toLowerCase()}`}
        >
          <img
            src={require("../assets/error-type/" +
              error.type.toLowerCase() +
              ".svg")}
          />
        </span>
        <span className="error-description">
          {error.nodes.length > 1 ? (
            <div className="error-description__message">
              {error.message}{" "}
              <span className="error-description__count">
                · ({error.count})
              </span>
            </div>
          ) : (
            <div className="error-description__message">{error.message}</div>
          )}
          {error.value ? (
            <div className="current-value tooltip" data-text="Tooltip">
              {truncate(error.value)}
            </div>
          ) : null}
        </span>
        <motion.span
          whileTap={{ scale: 0.98, opacity: 0.8 }}
          className="context-icon"
        >
          <div className="menu" ref={ref}>
            <div className="menu-trigger" onClick={showMenu}>
              <img src={require("../assets/context.svg")} />
            </div>
          </div>
        </motion.span>

        {error.nodes.length > 1 ? (
          <ul
            className={
              "menu-items select-menu__list " +
              (menuState ? "select-menu__list--active" : "")
            }
          >
            <li
              className="select-menu__list-item"
              key="list-item-1"
              onClick={event => {
                event.stopPropagation();
                handleSelectAll(error);
                hideMenu();
              }}
            >
              Select All ({error.count})
            </li>
            <li
              className="select-menu__list-item"
              key="list-item-3"
              onClick={event => {
                event.stopPropagation();
                handleIgnoreAll(error);
                hideMenu();
              }}
            >
              Ignore All
            </li>
            {error.type === "radius" && (
              <li
                className="select-menu__list-item select-menu__list-border"
                key="list-item-radius"
                onClick={event => {
                  event.stopPropagation();
                  handleBorderRadiusUpdate(error.value);
                  hideMenu();
                }}
              >
                Allow This Radius
              </li>
            )}
          </ul>
        ) : (
          <ul
            className={
              "menu-items select-menu__list " +
              (menuState ? "select-menu__list--active" : "")
            }
          >
            <li
              className="select-menu__list-item"
              key="list-item-1"
              onClick={event => {
                event.stopPropagation();
                handleSelect(error);
                hideMenu();
              }}
            >
              Select
            </li>
            <li
              className="select-menu__list-item"
              key="list-item-2"
              onClick={event => {
                event.stopPropagation();
                handleIgnoreChange(error);
                hideMenu();
              }}
            >
              Ignore
            </li>
            {error.type === "radius" && (
              <li
                className="select-menu__list-item select-menu__list-border"
                key="list-item-radius"
                onClick={event => {
                  event.stopPropagation();
                  handleBorderRadiusUpdate(error.value);
                  hideMenu();
                }}
              >
                Allow This Radius
              </li>
            )}
          </ul>
        )}
      </div>
    </motion.li>
  );
}

// React hook for detecting clicks outside the component
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const listener = event => {
      if (!ref.current || ref.current.contains(event.target)) {
        return;
      }
      handler(event);
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

export default BulkErrorListItem;
