import React from 'react';

class DropdownMenu extends React.Component {
  constructor(props, context) {
    super(props, context);

    this.handleClick = this.handleClick.bind(this);
  }

  render(){
    return (
      <div {...this.props} onClick={this.handleClick}>
        {this.props.children}
      </div>
    );
  }

  handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
  }
}

export default DropdownMenu;
