import React from 'react';
import DropdownMenu from './DropdownMenu';

class Dropdown extends React.Component {
  static propTypes = {
    className: React.PropTypes.string,
    activeClassName: React.PropTypes.string
  }

  static defaultProps = {
    className: '',
    activeClassName: 'active'
  }

  constructor(props, context){
    super(props, context);

    this.state = {
      active: false
    };

    this.handleClick = this.handleClick.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleDocumentKeydown = this.handleDocumentKeydown.bind(this);
  }

  componentDidMount(){
    document.addEventListener('click', this.handleDocumentClick);
    document.addEventListener('keydown', this.handleDocumentKeydown);
  }

  componentWillUnmount(){
    document.removeEventListener('click', this.handleDocumentClick);
    document.removeEventListener('keydown', this.handleDocumentKeydown);
  }

  render(){
    let children = [];
    let {className, activeClassName} = this.props;

    if (this.isActive()){
      className += className ? ' ' + activeClassName : activeClassName;
    }

    React.Children.forEach(this.props.children, item => {
      if (item.type === DropdownMenu){
        if (this.isActive()) children.push(item);
      } else {
        children.push(item);
      }
    });

    return (
      <div {...this.props} onClick={this.handleClick} className={className}>
        {children}
      </div>
    );
  }

  handleClick(e){
    e.preventDefault();
    this.toggle();
  }

  isActive(){
    return this.state.active;
  }

  open(){
    if (this.isActive()) return;
    this.setState({active: true});
  }

  close(){
    if (!this.isActive()) return;
    this.setState({active: false});
  }

  toggle(){
    if (this.isActive()){
      this.close();
    } else {
      this.open();
    }
  }

  handleDocumentClick(e){
    if (!this.isActive()) return;

    e.preventDefault();
    e.stopPropagation();
    this.close();
  }

  handleDocumentKeydown(e){
    if (e.keyCode === 27 && this.isActive()){
      this.close();
    }
  }
}

export default Dropdown;
