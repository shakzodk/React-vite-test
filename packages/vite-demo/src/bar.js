// @flow
import * as React from "react";

import Foo from "./foo.js";

export default class Bar extends React.Component<{}> {
    render() {
        return <Foo msg="bar">Hello, world!</Foo>;
    }
}
